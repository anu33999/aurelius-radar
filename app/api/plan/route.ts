import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getBusiness, getCatalogue } from "@/lib/db/repo";
import { buildKit } from "@/lib/leads/kit";
import { buildPlan } from "@/lib/leads/plan";
import { getRates } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("businessId");
    if (!id) return NextResponse.json({ error: "businessId required" }, { status: 400 });
    const business = await getBusiness(id);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
    const [{ services, isStarter }, rates] = await Promise.all([getCatalogue(), getRates()]);
    const plan = buildPlan(business, services, rates);
    const sender = process.env.SENDER_NAME || "Kreatif Atelier";
    const kit = buildKit(business, plan, sender, "Kreatif Atelier");
    return NextResponse.json({ plan, kit, catalogueIsStarter: isStarter });
  } catch (e) {
    return apiError(e);
  }
}
