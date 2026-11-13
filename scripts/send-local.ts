/**
 * Send the queued personal emails from this Mac instead of the website's server. Gmail is far less
 * likely to block an account that sends from the computer it normally signs in from.
 *
 *   npm run send            sends until today's limit, then stops (run it once a day)
 *
 * Needs GMAIL_USER and GMAIL_APP_PASSWORD in .env.local (never committed or uploaded).
 */
import { prisma } from "../lib/db/client";
import { runEmailQueue } from "../lib/email/runner";
import { activePause, clearPause, emailConfigured, fromAddress, getProfile, gmailUser, isGmailBlock, pauseMessage, pauseSending, sendMail } from "../lib/email/send";

const now = () => new Date().toTimeString().slice(0, 5);

async function retry<T>(f: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The database connection from this Mac sometimes drops for a minute: wait and try again.
      if (i < 6 && /Can't reach database|P1001|P1017|P2024|ECONNRESET|timed out|closed the connection|Connection terminated/i.test(msg)) {
        console.log(`${now()} ${label}: database not reachable, retrying in 30 s`);
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  if (!emailConfigured()) {
    console.log("Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.local first.");
    return;
  }
  console.log(`${now()} Sending as ${fromAddress()} from this Mac.`);
  // A pause from the website's server doesn't apply here; check Gmail with one email to yourself first.
  if (await retry(activePause, "pause check")) await retry(clearPause, "clear pause");
  try {
    await sendMail(gmailUser()!, "[TEST] Sending from your Mac", "Gmail accepted this from your Mac. Personal emails will now go out from the queue.", (await retry(getProfile, "profile")).senderName);
    console.log(`${now()} Gmail accepted a test email to ${gmailUser()}.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isGmailBlock(msg)) {
      console.log(`${now()} GMAIL REFUSED: ${msg.split("\n")[0]}`);
      console.log(pauseMessage(await retry(() => pauseSending(msg), "pause")));
      return;
    }
    throw e;
  }
  const total = { sent: 0, followUps: 0, replies: 0, failed: 0 };
  for (;;) {
    const r = await retry(() => runEmailQueue(10 * 60_000), "send");
    total.sent += r.sent;
    total.failed += r.failed;
    total.followUps += (r as { followUps?: number }).followUps ?? 0;
    total.replies += (r as { replies?: number }).replies ?? 0;
    console.log(`${now()} ${total.sent} sent, ${total.followUps} follow-ups, ${total.replies} new replies, ${r.queued} still queued`);
    if (r.stopped) {
      console.log(`${now()} ${r.stopped}`);
      break;
    }
    if (!r.queued || r.sent + r.skipped + r.failed === 0) break;
  }
  console.log(`DONE: ${total.sent} personal emails and ${total.followUps} follow-ups sent today.`);
}

main()
  .catch((e) => console.error("Stopped:", e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
