import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listOutreach, setOutreachFlag } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/** Every business the outreach has touched, with what was sent, follow-ups and replies. */
export async function GET() {
  try {
    return NextResponse.json({ rows: await listOutreach() });
  } catch (e) {
    return apiError(e);
  }
}

/** Manual corrections: mark replied / not replied, or "do not email" (also removes it from the queue). */
export async function PATCH(req: Request) {
  try {
    const { id, flag } = (await req.json()) as { id?: string; flag?: "replied" | "not-replied" | "opt-out" };
    if (!id || !flag || !["replied", "not-replied", "opt-out"].includes(flag)) return NextResponse.json({ error: "id and flag required" }, { status: 400 });
    await setOutreachFlag(id, flag);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
