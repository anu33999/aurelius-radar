import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { addNote, listNotes } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("businessId");
    if (!id) return NextResponse.json({ error: "businessId required" }, { status: 400 });
    return NextResponse.json({ notes: await listNotes(id) });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const { businessId, content } = await req.json();
    if (!businessId || !content?.trim()) return NextResponse.json({ error: "businessId and content required" }, { status: 400 });
    return NextResponse.json({ note: await addNote(businessId, content.trim()) });
  } catch (e) {
    return apiError(e);
  }
}
