/** Reads every business website that has no email yet (homepage + contact/about/imprint pages). Run: npx tsx scripts/find-emails.ts */
import { listSiteEmailCandidates, saveFoundEmail, countEmailFinderCandidates } from "../lib/db/repo";
import { findEmailOnSite } from "../lib/enrich/email-finder";
import { prisma } from "../lib/db/client";

async function main() {
  const total = { checked: 0, emails: 0 };
  for (;;) {
    // This computer's connection to the database sometimes drops for a minute; wait and retry instead of stopping.
    let batch: { id: string; website: string }[] = [];
    for (let tries = 0; ; tries++) {
      try {
        batch = await listSiteEmailCandidates(80);
        break;
      } catch (e) {
        if (tries >= 10) throw e;
        console.log("database unreachable, retrying in 30 s");
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }
    if (!batch.length) break;
    let next = 0;
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        while (next < batch.length) {
          const b = batch[next++];
          let email: string | null = null;
          try {
            email = await findEmailOnSite(b.website);
          } catch {
            /* unreachable site */
          }
          try {
            await saveFoundEmail(b.id, email, "SITE");
          } catch {
            await new Promise((r) => setTimeout(r, 3000));
            await saveFoundEmail(b.id, email, "SITE").catch(() => undefined);
          }
          total.checked++;
          if (email) total.emails++;
        }
      }),
    );
    const left = await countEmailFinderCandidates().catch(() => null);
    console.log(`${new Date().toTimeString().slice(0, 5)} checked ${total.checked}, emails found ${total.emails}, websites left ${left?.sites ?? "?"}`);
  }
  console.log(`FINISHED: ${total.checked} websites checked, ${total.emails} emails found`);
  await prisma.$disconnect();
}
main();
