import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { claimForSend, countEmailsSentSince, getEmailTargets, markEmailed, releaseClaim } from "@/lib/db/repo";
import { activePause, dailyLimit, emailConfigured, getProfile, isGmailBlock, pauseMessage, pauseSending, sendMail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Seconds between emails: a steady, human pace keeps Gmail from flagging the account. */
const SPACING_MS = 8000;

/**
 * Send up to 20 reviewed drafts, one at a time. The client sends the rest in later requests. A business
 * that was already emailed or opted out is skipped, so nobody gets the same pitch twice.
 */
export async function POST(req: Request) {
  try {
    if (!emailConfigured()) return NextResponse.json({ error: "Gmail sending isn't set up: add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel." }, { status: 400 });
    const { items } = (await req.json()) as { items?: { id: string; subject: string; body: string; focus?: string }[] };
    if (!Array.isArray(items) || !items.length) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
    if (process.env.SEND_FROM_SERVER === "off") return NextResponse.json({ results: [], stopped: "Emails are sent from your Mac. Run npm run send there.", processed: 0 });
    const pause = await activePause();
    if (pause) return NextResponse.json({ results: [], stopped: pauseMessage(pause), processed: 0 });
    const batch = items.slice(0, 20);
    const profile = await getProfile();
    const targets = new Map((await getEmailTargets(batch.map((i) => i.id))).map((t) => [t.business.id, t.business]));
    const since = new Date(new Date().setHours(0, 0, 0, 0));
    const limit = await dailyLimit();
    let left = limit - (await countEmailsSentSince(since));
    const deadline = Date.now() + 250_000;
    const results: { id: string; ok: boolean; already?: boolean; error?: string }[] = [];
    let stopped: string | null = null;
    for (const item of batch) {
      const b = targets.get(item.id);
      if (!b?.email) { results.push({ id: item.id, ok: false, error: "No email address" }); continue; }
      if (b.emailStatus === "OPTED_OUT") { results.push({ id: item.id, ok: false, already: true, error: "Asked not to be emailed" }); continue; }
      if (b.emailStatus === "SENT" || b.emailStatus === "SENDING") { results.push({ id: item.id, ok: false, already: true, error: "Already sent" }); continue; }
      if (left <= 0) { stopped = `Daily limit of ${limit} reached. The rest can go tomorrow.`; break; }
      if (Date.now() + SPACING_MS > deadline) break;
      if (!(await claimForSend(b.id))) { results.push({ id: b.id, ok: false, already: true, error: "Already sent" }); continue; }
      const started = Date.now();
      try {
        const subject = item.subject.slice(0, 200);
        const messageId = await sendMail(b.email, subject, item.body.slice(0, 10000), profile.senderName);
        await markEmailed(b.id, true, null, b.pipelineStage, { subject, messageId, focus: item.focus ?? null, body: item.body.slice(0, 10000) });
        results.push({ id: b.id, ok: true });
        left--;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Send failed";
        // Gmail blocking the account fails every email: undo this one (it wasn't sent) and pause for 24 hours.
        if (isGmailBlock(msg)) {
          await releaseClaim(b.id);
          stopped = pauseMessage(await pauseSending(msg));
          break;
        }
        await markEmailed(b.id, false, msg, b.pipelineStage);
        results.push({ id: b.id, ok: false, error: msg });
      }
      await new Promise((r) => setTimeout(r, Math.max(0, SPACING_MS - (Date.now() - started))));
    }
    return NextResponse.json({ results, stopped, processed: results.length });
  } catch (e) {
    return apiError(e);
  }
}
