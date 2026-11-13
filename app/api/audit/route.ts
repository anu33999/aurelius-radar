import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getAuditJson, getCatalogue, saveAuditToBusiness } from "@/lib/db/repo";
import { runAudit } from "@/lib/audit/run-audit";
import { baselineTechStack } from "@/lib/audit/pitch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { input?: string; businessId?: string; save?: boolean; monthlyBudget?: string };
    if (!body.input?.trim()) return NextResponse.json({ error: "Enter a business name or website URL." }, { status: 400 });

    const { services, isStarter } = await getCatalogue();
    const audit = await runAudit({ input: body.input, catalogue: services, monthlyBudget: body.monthlyBudget });

    let business = null;
    if (body.save !== false) {
      const codes = [...audit.match.quickWins, ...audit.match.coreGrowth].map((m) => m.service.code);
      business = await saveAuditToBusiness({
        businessId: body.businessId,
        name: audit.businessName,
        website: audit.website,
        techStack: baselineTechStack(audit.baseline),
        matchedServiceCodes: codes,
        readinessScore: audit.readinessScore,
        opportunityScore: audit.opportunityScore,
        pitchSummary: audit.pitch.coldEmail.subject,
        auditJson: JSON.stringify(audit),
        instagramUrl: audit.baseline?.social.instagram ?? null,
        linkedinUrl: audit.baseline?.social.linkedin ?? null,
        whatsapp: audit.baseline?.widgets.whatsappNumber ?? null,
      });
    }
    return NextResponse.json({ audit, business, catalogueIsStarter: isStarter });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("businessId");
    if (!id) return NextResponse.json({ error: "businessId required" }, { status: 400 });
    const raw = await getAuditJson(id);
    return NextResponse.json({ audit: raw ? JSON.parse(raw) : null });
  } catch (e) {
    return apiError(e);
  }
}
