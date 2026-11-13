import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { countPlacesCandidates, listPlacesCandidates, savePlacesMatch } from "@/lib/db/repo";
import { lookupPlace, placesConfigured } from "@/lib/search/places";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Whether a Google key is set, and how many businesses with no phone haven't been looked up yet. */
export async function GET() {
  try {
    return NextResponse.json({ configured: placesConfigured(), remaining: await countPlacesCandidates() });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * Look up one batch on Google (each lookup is billed by Google). The client repeats until `remaining`
 * is 0 or the user stops. Any Google error (bad key, billing off, quota) stops the batch at once and is
 * returned, so a broken key never burns through the list.
 */
export async function POST(req: Request) {
  try {
    if (!placesConfigured()) return NextResponse.json({ error: "Add GOOGLE_PLACES_API_KEY in Vercel first." }, { status: 400 });
    const { size } = (await req.json().catch(() => ({}))) as { size?: number };
    const batch = await listPlacesCandidates(Math.min(Math.max(size ?? 50, 1), 100));
    const deadline = Date.now() + 220_000;
    const stats = { lookups: 0, matched: 0, phones: 0 };
    let googleError: string | null = null;
    let next = 0;
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        while (next < batch.length && !googleError && Date.now() < deadline) {
          const b = batch[next++];
          let match;
          try {
            match = await lookupPlace(b);
          } catch (e) {
            googleError = e instanceof Error ? e.message : "Google Places request failed";
            return;
          }
          stats.lookups++;
          await savePlacesMatch(b.id, match);
          if (match) stats.matched++;
          if (match?.phone) stats.phones++;
        }
      }),
    );
    return NextResponse.json({ ...stats, error: googleError, remaining: await countPlacesCandidates() });
  } catch (e) {
    return apiError(e);
  }
}
