import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { countEmailsSentSince, setSetting } from "@/lib/db/repo";
import { DEFAULT_PROFILE, type SenderProfile } from "@/lib/email/compose";
import { dailyLimit, emailConfigured, fromAddress, getProfile } from "@/lib/email/send";
import { aiEnabled } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

const startOfDay = () => new Date(new Date().setHours(0, 0, 0, 0));

/** Sender profile, whether Gmail sending is set up, and today's count against the daily cap. */
export async function GET() {
  try {
    return NextResponse.json({
      profile: await getProfile(),
      configured: emailConfigured(),
      from: emailConfigured() ? fromAddress() : null,
      ai: aiEnabled(),
      sentToday: await countEmailsSentSince(startOfDay()),
      dailyLimit: await dailyLimit(),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<SenderProfile>;
    const profile: SenderProfile = { ...DEFAULT_PROFILE };
    for (const k of Object.keys(DEFAULT_PROFILE) as (keyof SenderProfile)[]) if (typeof body[k] === "string") profile[k] = body[k]!.slice(0, 500);
    await setSetting("senderProfile", profile);
    return NextResponse.json({ profile });
  } catch (e) {
    return apiError(e);
  }
}
