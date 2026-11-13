import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { clearEmailQueue, countEmailQueue, countEmailsSentSince, countReplies, queueForEmail } from "@/lib/db/repo";
import { activePause, dailyLimit, emailConfigured, getProfile, pauseMessage, skippedCountries } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const startOfDay = () => new Date(new Date().setHours(0, 0, 0, 0));

/** How many businesses are waiting in the auto-email queue, and today's sending room. */
export async function GET() {
  try {
    return NextResponse.json({ queued: await countEmailQueue(), configured: emailConfigured(), sentToday: await countEmailsSentSince(startOfDay()), dailyLimit: await dailyLimit(), replies: await countReplies(), paused: await activePause().then((p) => (p ? pauseMessage(p) : null)) });
  } catch (e) {
    return apiError(e);
  }
}

/** Add businesses to the queue (only ones with an email that were never emailed). */
export async function POST(req: Request) {
  try {
    const { ids } = (await req.json()) as { ids?: string[] };
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "Nothing to queue." }, { status: 400 });
    // Countries listed under "never email" (Germany by default) are never queued.
    const added = await queueForEmail(ids.slice(0, 20000), skippedCountries(await getProfile()));
    return NextResponse.json({ added, queued: await countEmailQueue() });
  } catch (e) {
    return apiError(e);
  }
}

/** Empty the queue (stops automatic sending). */
export async function DELETE() {
  try {
    return NextResponse.json({ cleared: await clearEmailQueue() });
  } catch (e) {
    return apiError(e);
  }
}
