import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getRates } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/** Exchange rates used to show asking prices in each prospect's own currency. */
export async function GET() {
  try {
    const r = await getRates();
    return NextResponse.json({ perUSD: r.perUSD, source: r.source, asOf: r.asOf });
  } catch (e) {
    return apiError(e);
  }
}
