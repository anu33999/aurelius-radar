import { claimFollowUp, claimFollowUpUndo, claimForSend, releaseClaim, countEmailQueue, queueAgain, countEmailsSentSince, listAwaitingReply, listFollowUpsDue, markEmailed, nextQueuedIds, unqueue } from "@/lib/db/repo";
import { composeFollowUp } from "@/lib/email/compose";
import { addBusinessDays, recordReplies } from "@/lib/email/inbox";
import { ADDRESS_NEEDED, researchAndDraft } from "@/lib/email/pipeline";
import { activePause, dailyLimit, emailConfigured, getProfile, isGmailBlock, pauseMessage, pauseSending, sendMail, skippedCountries } from "@/lib/email/send";


/** Seconds between emails: a steady, human pace keeps Gmail from flagging the account. */
const SPACING_MS = 8000;

/**
 * Work through the auto-email queue: research each business, write its personal email and send it,
 * until the daily cap or the time budget is reached. Called repeatedly by the Directory while it is
 * open, and once a day by the Vercel cron so the queue keeps moving with the page closed.
 */
export async function runEmailQueue(budgetMs = 240_000) {
  if (!emailConfigured()) return { sent: 0, failed: 0, skipped: 0, queued: await countEmailQueue(), stopped: "Gmail sending isn't set up: add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel." };
  const pause = await activePause();
  if (pause) return { sent: 0, failed: 0, skipped: 0, replies: 0, followUps: 0, queued: await countEmailQueue(), stopped: pauseMessage(pause) };
  const deadline = Date.now() + budgetMs;
  const since = new Date(new Date().setHours(0, 0, 0, 0));
  const limit = await dailyLimit();
  let left = limit - (await countEmailsSentSince(since));
  const profile = await getProfile();
  const stats = { sent: 0, failed: 0, skipped: 0, replies: 0, followUps: 0 };
  let stopped: string | null = null;

  // 1. Record replies, then send the single follow-up to anyone who hasn't answered after 4 working days.
  //    If Gmail's inbox can't be read, no follow-ups go out: we never chase someone who may have replied.
  const awaiting = await listAwaitingReply();
  if (awaiting.length) {
    try {
      stats.replies = await recordReplies(awaiting);
      const due = await listFollowUpsDue(new Date(Date.now() - 4 * 86400_000), 50);
      for (const f of due) {
        if (left <= 0 || Date.now() + SPACING_MS > deadline - 120_000) break;
        if (addBusinessDays(new Date(f.business.emailedAt!), 4) > new Date()) continue;
        if (!f.business.email || !(await claimFollowUp(f.business.id))) continue;
        const fu = composeFollowUp(f.business, f.subject ?? `A note for ${f.business.name}`, f.focus, profile);
        try {
          await sendMail(f.business.email, fu.subject, fu.body, profile.senderName, f.messageId);
          stats.followUps++;
          left--;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Send failed";
          if (isGmailBlock(msg)) {
            await claimFollowUpUndo(f.business.id);
            stopped = pauseMessage(await pauseSending(msg));
            break;
          }
        }
        await new Promise((r) => setTimeout(r, SPACING_MS));
      }
    } catch {
      /* inbox unreachable: skip follow-ups this round */
    }
  }
  // 2. New personal emails from the queue.
  while (!stopped && left > 0 && Date.now() + 90_000 < deadline) {
    // US businesses wait in the queue until a postal address is added (CAN-SPAM); everyone else keeps going.
    const ids = await nextQueuedIds(Math.min(4, left), [...skippedCountries(profile), ...(profile.address.trim() ? [] : ["United States"])]);
    if (!ids.length) break;
    const drafts = await researchAndDraft(ids);
    for (const d of drafts) {
      // Keep US businesses queued until the address is added, and stop so the user sees why.
      if (d.skip === ADDRESS_NEEDED) continue;
      if (d.skip || !d.to || !d.subject || !d.body) {
        stats.skipped++;
        await unqueue(d.id);
        continue;
      }
      if (left <= 0 || Date.now() + SPACING_MS > deadline) break;
      if (!(await claimForSend(d.id))) {
        stats.skipped++;
        await unqueue(d.id);
        continue;
      }
      const started = Date.now();
      try {
        const messageId = await sendMail(d.to, d.subject, d.body, profile.senderName);
        await markEmailed(d.id, true, null, undefined, { subject: d.subject, messageId, focus: d.focus ?? null, body: d.body });
        stats.sent++;
        left--;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Send failed";
        // A login or quota error would fail every email: keep this one queued and stop.
        if (isGmailBlock(msg)) {
          // Not this business's fault: put it back unsent and pause everything for 24 hours.
          await releaseClaim(d.id);
          await queueAgain(d.id);
          stopped = pauseMessage(await pauseSending(msg));
          break;
        }
        await markEmailed(d.id, false, msg);
        stats.failed++;
      }
      await new Promise((r) => setTimeout(r, Math.max(0, SPACING_MS - (Date.now() - started))));
    }
  }
  if (!stopped && left <= 0) stopped = `Daily limit of ${limit} reached. The queue continues tomorrow.`;
  return { ...stats, queued: await countEmailQueue(), stopped };
}

