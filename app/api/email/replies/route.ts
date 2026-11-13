import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { recordReplies } from "@/lib/email/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Check the Gmail inbox now for replies from everyone emailed in the last 30 days (read-only). */
export async function POST() {
  try {
    return NextResponse.json({ found: await recordReplies() });
  } catch (e) {
    return apiError(e);
  }
}
