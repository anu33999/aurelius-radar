import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { countContactCandidates, listContactCandidates, saveFoundContacts } from "@/lib/db/repo";
import { findContacts } from "@/lib/enrich/contacts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** How many businesses have a website but no phone and haven't been checked yet. */
export async function GET() {
  try {
    return NextResponse.json({ remaining: await countContactCandidates() });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * Read one batch of websites for published phone / email / WhatsApp. The client calls this repeatedly
 * until `remaining` is 0. Each site is marked checked whether or not anything was found, so the
 * loop always moves forward.
 */
export async function POST() {
  try {
    const deadline = Date.now() + 220_000;
    const batch = await listContactCandidates(60);
    const stats = { checked: 0, phones: 0, emails: 0, whatsapp: 0, failed: 0 };
    let next = 0;
    // 8 sites at a time; a worker stops taking new sites once the deadline is near.
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < batch.length && Date.now() < deadline) {
          const b = batch[next++];
          let found = { phone: null as string | null, email: null as string | null, whatsapp: null as string | null };
          try {
            found = await findContacts(b.website);
          } catch {
            stats.failed++;
          }
          await saveFoundContacts(b.id, found);
          stats.checked++;
          if (found.phone) stats.phones++;
          if (found.email) stats.emails++;
          if (found.whatsapp) stats.whatsapp++;
        }
      }),
    );
    return NextResponse.json({ ...stats, remaining: await countContactCandidates() });
  } catch (e) {
    return apiError(e);
  }
}
