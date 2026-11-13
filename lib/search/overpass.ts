import { HUBS, type Hub, type Region } from "@/lib/hubs";
import { nicheById, type Niche } from "@/lib/niches";
import type { BusinessInput } from "@/lib/db/repo";

/**
 * Directory discovery from OpenStreetMap (Overpass API). OSM data is community-maintained and
 * incomplete, so results are imported as unverified LEADs with source "OSM". Only data present
 * in OSM is stored - no phone numbers or emails are ever guessed.
 */

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function industryFrom(tags: Record<string, string>): string | null {
  if (tags.office) {
    const map: Record<string, string> = {
      it: "IT / Software", company: "Corporate / B2B", estate_agent: "Real Estate", financial: "Financial Services",
      insurance: "Insurance", lawyer: "Legal", accountant: "Accounting", coworking: "Coworking", advertising_agency: "Marketing & Advertising",
      architect: "Architecture & Design", consulting: "Consulting", employment_agency: "HR & Staffing", educational_institution: "Education",
    };
    return map[tags.office] ?? `Office (${tags.office})`;
  }
  if (tags.amenity) {
    const map: Record<string, string> = {
      restaurant: "Hospitality (Restaurant)", cafe: "Hospitality (Cafe)", clinic: "Healthcare", hospital: "Healthcare",
      dentist: "Healthcare", pharmacy: "Healthcare", bank: "Financial Services", fast_food: "Hospitality (QSR)", pub: "Hospitality",
    };
    return map[tags.amenity] ?? tags.amenity;
  }
  if (tags.shop) return `Retail (${tags.shop.replace(/_/g, " ")})`;
  if (tags.craft) return `Craft (${tags.craft})`;
  if (tags.industrial) return `Manufacturing (${tags.industrial.replace(/_/g, " ")})`;
  if (tags.man_made === "works" || /^(factory|manufacture|industrial)$/.test(tags.building ?? "")) return "Manufacturing";
  return null;
}

export interface DiscoverOptions {
  limit?: number;
  /** Niche id from lib/niches.ts. Omit for the broad "commercial businesses that list a website" search. */
  niche?: string | null;
  /** Which prospects to return. "any" (default) keeps everything; "with" only those listing a website; "without" only those with no website; "bare" no website AND no social link. */
  websiteMode?: WebsiteMode;
}

export type WebsiteMode = "any" | "with" | "without" | "bare";

/** Post-filter used for every provider (OSM already filters in the query; Google Places results are filtered here). */
export function matchesWebsiteMode(b: { website?: string | null; instagramUrl?: string | null; linkedinUrl?: string | null }, mode: WebsiteMode): boolean {
  if (mode === "with") return !!b.website;
  if (mode === "without") return !b.website;
  if (mode === "bare") return !b.website && !b.instagramUrl && !b.linkedinUrl;
  return true;
}

export function buildQuery(hub: Hub, limit: number, niche: Niche | null, mode: WebsiteMode): string {
  // A global bounding box (the square around the hub's radius) is far faster on Overpass than
  // per-statement `around:` filters; it covers the circle plus its corners.
  const dLat = hub.radiusM / 111320;
  const dLng = hub.radiusM / (111320 * Math.cos((hub.lat * Math.PI) / 180));
  const head = `[out:json][timeout:200][bbox:${(hub.lat - dLat).toFixed(5)},${(hub.lng - dLng).toFixed(5)},${(hub.lat + dLat).toFixed(5)},${(hub.lng + dLng).toFixed(5)}]`;
  const requireWebsite = mode === "with";
  const web = requireWebsite ? '["website"]' : mode === "without" || mode === "bare" ? '[!"website"][!"contact:website"]' : "";
  const social = mode === "bare" ? '[!"contact:instagram"][!"contact:facebook"][!"contact:linkedin"]' : "";
  if (niche) {
    const lines = niche.osm.map((sel) => `  nwr["${sel.key}"~"^(${sel.values})$"]["name"]${web}${social};`);
    // Also match contact:website when a website is required.
    if (requireWebsite) lines.push(...niche.osm.map((sel) => `  nwr["name"]["contact:website"]["${sel.key}"~"^(${sel.values})$"];`));
    return `${head};\n(\n${lines.join("\n")}\n);\nout center tags ${limit};`;
  }
  if (mode !== "with") {
    // Broad search with no niche and no website requirement: common local-business categories.
    const sels = ['["amenity"~"^(restaurant|cafe|dentist|clinic|fast_food|bar|pub|pharmacy)$"]', '["shop"]', '["office"~"^(company|estate_agent|architect|lawyer|accountant)$"]', '["leisure"="fitness_centre"]', '["healthcare"]', '["craft"]', '["man_made"="works"]', '["industrial"]'];
    return `${head};\n(\n${sels.map((s) => `  nwr${s}["name"]${web}${social};`).join("\n")}\n);\nout center tags ${limit};`;
  }
  return `${head};
(
  nwr["name"]["website"]["office"];
  nwr["name"]["website"]["shop"];
  nwr["name"]["website"]["amenity"~"restaurant|cafe|clinic|hospital|dentist|fast_food|bank"];
  nwr["name"]["contact:website"]["office"];
  nwr["name"]["contact:website"]["shop"];
);
out center tags ${limit};`;
}

const UA = "AureliusRadar/1.0 (Kreatif Atelier)";

/** OSM WhatsApp tags hold a number or a wa.me / api.whatsapp.com link; keep just the number. */
function waTag(v: string | undefined): string | null {
  if (!v) return null;
  const fromLink = /(?:wa\.me\/|phone=)(?:%2B|\+)?(\d{7,15})/i.exec(v)?.[1];
  return fromLink ? `+${fromLink}` : v.split(";")[0].trim() || null;
}
const OVERPASS_BUDGET_MS = 240000;

async function overpass(hub: Hub, opts: DiscoverOptions): Promise<BusinessInput[]> {
  const niche = nicheById(opts.niche);
  const limit = opts.limit ?? 300;
  const mode: WebsiteMode = opts.websiteMode ?? "any";
  // The public Overpass servers are shared and often overloaded or slow. The search itself is never reduced:
  // same area, same categories. All three mirrors are asked at once and the first good answer wins, so each
  // gets the whole time budget; if they all fail fast (e.g. 429), we pause and ask again.
  const mirrors = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  const body = `data=${encodeURIComponent(buildQuery(hub, limit, niche, mode))}`;
  let res: Response | null = null;
  const failures: string[] = [];
  // Stop well inside the route's maxDuration (300s), so a slow day ends in a clear error
  // instead of the platform killing the function mid-request.
  const deadline = Date.now() + OVERPASS_BUDGET_MS;
  while (!res && deadline - Date.now() > 10000) {
    const controllers = mirrors.map(() => new AbortController());
    const timer = setTimeout(() => controllers.forEach((c) => c.abort()), deadline - Date.now());
    try {
      const [winner, wi] = await Promise.any(
        mirrors.map(async (url, i) => {
          try {
            const r = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
              body,
              signal: controllers[i].signal,
            });
            if (r.ok) return [r, i] as const;
            failures.push(`${new URL(url).hostname} ${r.status}`);
            throw new Error(String(r.status));
          } catch (e) {
            if (!(e instanceof Error && /^\d+$/.test(e.message))) {
              failures.push(`${new URL(url).hostname} ${e instanceof Error && /abort|timeout/i.test(e.name + e.message) ? "timed out" : e instanceof Error ? e.message : "failed"}`);
            }
            throw e;
          }
        }),
      );
      controllers.forEach((c, i) => {
        if (i !== wi) c.abort();
      });
      res = winner;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!res) throw new Error(`OpenStreetMap servers are overloaded right now (${failures.slice(-3).join("; ")}). This is on their side, not your search. Wait a minute and press the button again.`);
  const data = (await res.json()) as { elements?: OsmElement[] };

  const out: BusinessInput[] = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || lat == null || lon == null) continue;
    const site = tags.website ?? tags["contact:website"] ?? null;
    const addr = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:postcode"]].filter(Boolean).join(", ");
    out.push({
      name,
      industry: niche?.label ?? industryFrom(tags),
      niche: niche?.id ?? null,
      instagramUrl: tags["contact:instagram"] ? socialUrl("instagram", tags["contact:instagram"]) : null,
      linkedinUrl: tags["contact:linkedin"] ? socialUrl("linkedin", tags["contact:linkedin"]) : null,
      website: site,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      whatsapp: waTag(tags["contact:whatsapp"] ?? tags.whatsapp),
      email: tags.email ?? tags["contact:email"] ?? null,
      address: addr || null,
      city: hub.name,
      locality: tags["addr:suburb"] ?? null,
      country: hub.country,
      latitude: lat,
      longitude: lon,
      source: "OSM",
    });
  }
  return out.filter((b) => matchesWebsiteMode(b, mode));
}

function socialUrl(kind: "instagram" | "linkedin", v: string): string {
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "");
  return kind === "instagram" ? `https://www.instagram.com/${h}/` : `https://www.linkedin.com/company/${h}/`;
}

export async function discoverHub(hubName: string, opts: DiscoverOptions = {}): Promise<BusinessInput[]> {
  const hub = HUBS.find((h) => h.name.toLowerCase() === hubName.toLowerCase());
  if (!hub) throw new Error(`Unknown market: ${hubName}`);
  return overpass(hub, opts);
}

/** Look a city up on OpenStreetMap Nominatim so any city in the world can be imported. */
export async function geocodeCity(query: string): Promise<Hub> {
  const q = query.trim();
  if (q.length < 2) throw new Error("Type a city name, e.g. \"Lisbon, Portugal\".");
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" } });
  if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> }[];
  const r = rows[0];
  if (!r) throw new Error(`Could not find "${q}" on OpenStreetMap. Try adding the country.`);
  const a = r.address ?? {};
  return {
    name: a.city ?? a.town ?? a.municipality ?? r.name ?? q.split(",")[0].trim(),
    country: a.country ?? "Unknown",
    region: "Europe" as Region, // region is only used for the preset list; custom cities are filtered by country
    lat: Number(r.lat),
    lng: Number(r.lon),
    radiusM: 3000,
  };
}

/** Run discovery around an already-resolved location. */
export const discoverAt = overpass;

export async function discoverCity(query: string, opts: DiscoverOptions = {}): Promise<{ hub: Hub; items: BusinessInput[] }> {
  const hub = await geocodeCity(query);
  return { hub, items: await overpass(hub, opts) };
}
