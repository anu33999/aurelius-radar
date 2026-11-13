import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { countEmailQueue } from "@/lib/db/repo";
import { runEmailQueue } from "@/lib/email/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sending can run from the user's own Mac instead (scripts/send-local.ts): Gmail is far less likely to
 * block an account that sends from the computer it normally signs in from. SEND_FROM_SERVER=off in
 * Vercel then stops the website from sending, so the two never send at the same time.
 */
async function run() {
  if (process.env.SEND_FROM_SERVER === "off") return { sent: 0, failed: 0, skipped: 0, queued: await countEmailQueue(), stopped: "Emails are sent from your Mac. Run the send command there." };
  return runEmailQueue();
}

export async function POST() {
  try {
    return NextResponse.json(await run());
  } catch (e) {
    return apiError(e);
  }
}

/** Vercel cron (GET). When CRON_SECRET is set, only Vercel's scheduler can trigger it. */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await run());
  } catch (e) {
    return apiError(e);
  }
}
