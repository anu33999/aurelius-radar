import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { countEmailFinderCandidates, listSiteEmailCandidates, listWebEmailCandidates, saveFoundEmail } from "@/lib/db/repo";
import { findEmailOnSite, findEmailOnWeb } from "@/lib/enrich/email-finder";
import { searchConfigured } from "@/lib/search/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Web searches are spaced to stay under the search plan's per-minute limit (TinyFish: 30). */
const SPACING_MS = 2200;

/** How many businesses are left for each email finder. */
export async function GET() {
  try {
    return NextResponse.json({ ...(await countEmailFinderCandidates()), searchConfigured: searchConfigured() });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * One batch. mode "site" (free): read each business's own website for an email, 8 sites at a time.
 * mode "web" (one search credit each): search the web for businesses with no website. The client (or a
 * script) repeats until `remaining` is 0.
 */
export async function POST(req: Request) {
  try {
    const { mode = "site", size } = (await req.json().catch(() => ({}))) as { mode?: "site" | "web"; size?: number };
    const deadline = Date.now() + 230_000;
    const stats = { checked: 0, emails: 0, failed: 0 };
    let error: string | null = null;
    if (mode === "site") {
      const batch = await listSiteEmailCandidates(Math.min(Math.max(size ?? 60, 1), 80));
      let next = 0;
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          while (next < batch.length && Date.now() < deadline) {
            const b = batch[next++];
            let email: string | null = null;
            try {
              email = await findEmailOnSite(b.website);
            } catch {
              stats.failed++;
            }
            await saveFoundEmail(b.id, email, "SITE");
            stats.checked++;
            if (email) stats.emails++;
          }
        }),
      );
    } else {
      if (!searchConfigured()) return NextResponse.json({ error: "No search provider key is set." }, { status: 400 });
      const batch = await listWebEmailCandidates(Math.min(Math.max(size ?? 90, 1), 100));
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (const b of batch) {
        if (Date.now() + SPACING_MS > deadline) break;
        const started = Date.now();
        let email: string | null = null;
        try {
          email = await findEmailOnWeb(b);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Search failed";
          if (/\b429\b|rate limit/i.test(msg) && Date.now() + 40_000 < deadline) {
            await sleep(35_000);
            try {
              email = await findEmailOnWeb(b);
            } catch (e2) {
              error = e2 instanceof Error ? e2.message : "Search failed";
              break;
            }
          } else {
            error = msg;
            break;
          }
        }
        await saveFoundEmail(b.id, email, "WEB_SEARCH");
        stats.checked++;
        if (email) stats.emails++;
        await sleep(Math.max(0, SPACING_MS - (Date.now() - started)));
      }
    }
    const left = await countEmailFinderCandidates();
    return NextResponse.json({ ...stats, error, remaining: mode === "site" ? left.sites : left.web });
  } catch (e) {
    return apiError(e);
  }
}
