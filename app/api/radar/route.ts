import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { aiEnabled } from "@/lib/ai/anthropic";
import { getCatalogue, getLead, listLeads, updateLead } from "@/lib/db/repo";
import { generateLeadPitch } from "@/lib/search/lead-pitch";
import { activeSearchProvider, searchConfigured } from "@/lib/search/providers";
import { runRadarScan } from "@/lib/search/social-radar";
import type { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const leads = await listLeads({
      platform: sp.get("platform") || undefined,
      status: sp.get("status") || undefined,
      category: sp.get("category") || undefined,
      shortlisted: sp.get("shortlisted") === "1",
    });
    return NextResponse.json({ leads, config: { searchConfigured: searchConfigured(), searchProvider: activeSearchProvider(), aiEnabled: aiEnabled() } });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { window?: "day" | "week"; platforms?: Platform[] };
    const summary = await runRadarScan({ window: body.window === "day" ? "day" : "week", platforms: body.platforms });
    return NextResponse.json({ summary });
  } catch (e) {
    return apiError(e, 400);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id: string; status?: string; regenerate?: boolean; shortlisted?: boolean };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (body.regenerate) {
      const lead = await getLead(body.id);
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      const { services } = await getCatalogue();
      const svcs = services.filter((s) => lead.matchedServices.includes(s.code));
      const pitch = await generateLeadPitch({
        platform: lead.platform,
        title: lead.postTitle ?? "",
        content: lead.postContent,
        painPoint: lead.painPoint,
        tags: svcs.flatMap((s) => s.tags),
        services: svcs,
        sender: process.env.SENDER_NAME || "Kreatif Atelier",
      });
      return NextResponse.json({ lead: await updateLead(body.id, { pitchDraft: pitch }) });
    }
    return NextResponse.json({ lead: await updateLead(body.id, { status: body.status, shortlisted: body.shortlisted }) });
  } catch (e) {
    return apiError(e);
  }
}
