import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { researchAndDraft } from "@/lib/email/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Research and write personal drafts for up to 10 businesses (the client repeats for the rest). Nothing is sent here. */
export async function POST(req: Request) {
  try {
    const { ids } = (await req.json()) as { ids?: string[] };
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "Choose businesses first." }, { status: 400 });
    return NextResponse.json({ drafts: await researchAndDraft(ids.slice(0, 10)) });
  } catch (e) {
    return apiError(e);
  }
}
