import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { bulkCreateBusinesses } from "@/lib/db/repo";
import { HUBS } from "@/lib/hubs";
import { NICHES } from "@/lib/niches";
import { discoverAt, geocodeCity, matchesWebsiteMode, type WebsiteMode } from "@/lib/search/overpass";
import { placesConfigured, searchPlaces } from "@/lib/search/places";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ hubs: HUBS, niches: NICHES, placesConfigured: placesConfigured() });
}

/** Import real listings for a market (or any city) and optional niche. Source: Google Places if a key is set, else OpenStreetMap. */
export async function POST(req: Request) {
  try {
    const { hub, city, niche, limit, websiteMode, radiusKm } = (await req.json()) as {
      hub?: string;
      city?: string;
      niche?: string | null;
      limit?: number;
      websiteMode?: WebsiteMode;
      /** Search radius in km (1-50). Omit to use the market's own city-centre radius. */
      radiusKm?: number | null;
    };
    const n = Math.min(limit ?? 2000, 2000);
    if (!hub && !city) return NextResponse.json({ error: "Choose a market or type a city." }, { status: 400 });

    const found = city ? await geocodeCity(city) : HUBS.find((h) => h.name.toLowerCase() === (hub ?? "").toLowerCase());
    if (!found) return NextResponse.json({ error: `Unknown market: ${hub}` }, { status: 400 });
    const target = radiusKm ? { ...found, radiusM: Math.round(Math.min(Math.max(radiusKm, 1), 50) * 1000) } : found;

    let items;
    let provider: "Google Places" | "OpenStreetMap";
    if (placesConfigured() && niche) {
      items = (await searchPlaces(target, niche, 20)).filter((b) => matchesWebsiteMode(b, websiteMode ?? "any"));
      provider = "Google Places";
    } else {
      items = await discoverAt(target, { limit: n, niche, websiteMode: websiteMode ?? "any" });
      provider = "OpenStreetMap";
    }
    const result = await bulkCreateBusinesses(items);
    return NextResponse.json({ found: items.length, place: `${target.name}, ${target.country}`, provider, ...result });
  } catch (e) {
    return apiError(e);
  }
}
