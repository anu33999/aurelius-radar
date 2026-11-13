import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { emailConfigured, getProfile, gmailUser, sendMail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/** Send a draft to your own Gmail only, to see exactly what a business would get. Nothing is marked as sent. */
export async function POST(req: Request) {
  try {
    if (!emailConfigured()) return NextResponse.json({ error: "Gmail sending isn't set up." }, { status: 400 });
    const { subject, body } = (await req.json()) as { subject?: string; body?: string };
    if (!subject || !body) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
    const profile = await getProfile();
    await sendMail(gmailUser()!, `[TEST] ${subject}`.slice(0, 200), body.slice(0, 10000), profile.senderName);
    return NextResponse.json({ sentTo: gmailUser() });
  } catch (e) {
    return apiError(e);
  }
}
