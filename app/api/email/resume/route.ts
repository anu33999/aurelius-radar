import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { resetGmailBlockFailures } from "@/lib/db/repo";
import { clearPause, emailConfigured, getProfile, gmailUser, isGmailBlock, pauseMessage, pauseSending, sendMail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/**
 * After a Gmail block: send one test email to yourself. If Gmail accepts it, the pause is lifted and the
 * emails Gmail refused go back to the queue as unsent. If not, the pause stays and the reason is shown.
 */
export async function POST() {
  try {
    if (!emailConfigured()) return NextResponse.json({ error: "Gmail sending isn't set up." }, { status: 400 });
    const profile = await getProfile();
    try {
      await sendMail(gmailUser()!, "[TEST] Aurelius Radar sending check", "Gmail is accepting emails from the app again. Sending will resume at a slower pace.", profile.senderName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      if (isGmailBlock(msg)) return NextResponse.json({ ok: false, message: pauseMessage(await pauseSending(msg)) });
      throw e;
    }
    await clearPause();
    const restored = await resetGmailBlockFailures();
    return NextResponse.json({ ok: true, restored, message: `Gmail is accepting emails again. ${restored} emails that Gmail refused are back in the queue.` });
  } catch (e) {
    return apiError(e);
  }
}
