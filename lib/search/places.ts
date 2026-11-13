import type { BusinessInput } from "@/lib/db/repo";
import { haversineM, type Hub } from "@/lib/hubs";
import { nicheById } from "@/lib/niches";

/**
 * Optional Google Places (New) Text Search. Only used when GOOGLE_PLACES_API_KEY is set; it adds
 * rating, review count and a phone number, which OpenStreetMap rarely has. Google does not expose
 * whether a Business Profile is "claimed", so that is never shown as a fact.
 * Check Google's Maps Platform terms for how long you may store Places content.
 */
export const placesConfigured = () => !!process.env.GOOGLE_PLACES_API_KEY;

interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  businessStatus?: string;
}

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.businessStatus",
].join(",");

export async function searchPlaces(hub: Hub, nicheId: string | null | undefined, limit = 20): Promise<BusinessInput[]> {
  const niche = nicheById(nicheId);
  const term = niche?.places ?? "businesses";
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY as string,
      "X-Goog-FieldMask": FIELDS,
    },
    body: JSON.stringify({
      textQuery: `${term} in ${hub.name}, ${hub.country}`,
      pageSize: Math.min(limit, 20),
      languageCode: "en",
      locationBias: { circle: { center: { latitude: hub.lat, longitude: hub.lng }, radius: Math.min(hub.radiusM, 50000) } },
    }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { places?: Place[] };
  return (data.places ?? [])
    .filter((p) => p.displayName?.text && (!p.businessStatus || p.businessStatus === "OPERATIONAL"))
    .map((p) => ({
      name: p.displayName?.text as string,
      industry: niche?.label ?? null,
      niche: niche?.id ?? null,
      website: p.websiteUri ?? null,
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
      address: p.formattedAddress ?? null,
      city: hub.name,
      country: hub.country,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      googleRating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      googlePlaceId: p.id,
      source: "GOOGLE_PLACES",
    }));
}

/** Lower-case words of a business name without punctuation or filler, for comparing names. */
function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["the", "and", "of", "pvt", "ltd", "llc", "inc", "co", "private", "limited"].includes(w));
}

/** True when two names share most of their words (or one contains the other). */
export function sameBusinessName(a: string, b: string): boolean {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  const jx = x.join(" ");
  const jy = y.join(" ");
  if (jx.includes(jy) || jy.includes(jx)) return true;
  const shared = x.filter((w) => y.includes(w)).length;
  return shared / Math.min(x.length, y.length) >= 0.6;
}

export interface PlaceMatch {
  placeId: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
}

/**
 * Look one known business up on Google by name and place. A result is accepted only when its name
 * matches and (if we have coordinates) it is within 1 km, so a chain's other branch is never taken.
 */
export async function lookupPlace(b: { name: string; city: string; country: string | null; latitude: number | null; longitude: number | null }): Promise<PlaceMatch | null> {
  const hasPos = b.latitude != null && b.longitude != null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY as string, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({
      textQuery: [b.name, b.city !== "Unspecified" ? b.city : null, b.country].filter(Boolean).join(", "),
      pageSize: 3,
      languageCode: "en",
      ...(hasPos ? { locationBias: { circle: { center: { latitude: b.latitude, longitude: b.longitude }, radius: 1000 } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { places?: Place[] };
  const hit = (data.places ?? []).find((p) => {
    if (!p.displayName?.text || !sameBusinessName(b.name, p.displayName.text)) return false;
    if (!hasPos || !p.location) return !hasPos;
    return haversineM(b.latitude as number, b.longitude as number, p.location.latitude, p.location.longitude) <= 1000;
  });
  if (!hit) return null;
  return {
    placeId: hit.id,
    phone: hit.internationalPhoneNumber ?? hit.nationalPhoneNumber ?? null,
    website: hit.websiteUri ?? null,
    rating: hit.rating ?? null,
    reviewCount: hit.userRatingCount ?? null,
  };
}
