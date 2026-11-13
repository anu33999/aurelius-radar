import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { countWebPhoneCandidates, listWebPhoneCandidates, saveWebPhone } from "@/lib/db/repo";
import { findPhoneOnWeb } from "@/lib/enrich/web-phone";
import { activeSearchProvider, searchConfigured } from "@/lib/search/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 2.2 s between searches = about 27 a minute, under TinyFish's 30-per-minute limit. */
const SPACING_MS = 2200;

/** Search provider in use, and how many businesses with no phone haven't been searched yet. */
export async function GET() {
  try {
    return NextResponse.json({ configured: searchConfigured(), provider: activeSearchProvider(), remaining: await countWebPhoneCandidates() });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * Search the web for one batch (one search credit per business). The client repeats until `remaining`
 * is 0 or the user stops. A provider error (bad key, out of credits) stops the batch and is returned.
 */
export async function POST(req: Request) {
  try {
    if (!searchConfigured()) return NextResponse.json({ error: "No search provider key is set." }, { status: 400 });
    const { size } = (await req.json().catch(() => ({}))) as { size?: number };
    const batch = await listWebPhoneCandidates(Math.min(Math.max(size ?? 100, 1), 100));
    const deadline = Date.now() + 220_000;
    const stats = { searched: 0, phones: 0 };
    let providerError: string | null = null;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Search APIs cap requests per minute (TinyFish: 30), so searches run one at a time, at most one
    // every SPACING_MS. A rate-limit reply waits once and retries; a second one stops the batch.
    for (const b of batch) {
      if (Date.now() + SPACING_MS > deadline) break;
      const started = Date.now();
      let phone: string | null = null;
      try {
        phone = await findPhoneOnWeb(b);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Search failed";
        if (!/\b429\b|rate limit/i.test(msg) || Date.now() + 40_000 > deadline) {
          providerError = msg;
          break;
        }
        await sleep(35_000);
        try {
          phone = await findPhoneOnWeb(b);
        } catch (e2) {
          providerError = e2 instanceof Error ? e2.message : "Search failed";
          break;
        }
      }
      stats.searched++;
      await saveWebPhone(b.id, phone);
      if (phone) stats.phones++;
      await sleep(Math.max(0, SPACING_MS - (Date.now() - started)));
    }
    return NextResponse.json({ ...stats, error: providerError, remaining: await countWebPhoneCandidates() });
  } catch (e) {
    return apiError(e);
  }
}
