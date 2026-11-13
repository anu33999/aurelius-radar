import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getCatalogue, listBusinesses, listLeads } from "@/lib/db/repo";
import { getRates } from "@/lib/pricing";
import { buildPdf, buildXlsx, type Scope } from "@/lib/export/build";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/export?scope=directory|crm|shortlist&format=xlsx|pdf[&country=..&niche=..] */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const scope = (sp.get("scope") ?? "directory") as Scope;
    const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";
    if (!["directory", "crm", "shortlist", "catalogue"].includes(scope)) return NextResponse.json({ error: "Unknown scope" }, { status: 400 });

    const { services } = await getCatalogue();
    let businesses = scope === "catalogue" ? [] : await listBusinesses({ country: sp.get("country") || undefined, city: sp.get("city") || undefined });
    const niche = sp.get("niche");
    if (niche) businesses = businesses.filter((b) => b.niche === niche);
    if (scope === "shortlist") businesses = businesses.filter((b) => b.shortlisted);
    const posts = scope === "shortlist" ? await listLeads({ shortlisted: true }) : [];

    const perUSD = (await getRates()).perUSD;
    const body = format === "pdf" ? await buildPdf(scope, businesses, posts, perUSD, services) : await buildXlsx(scope, businesses, posts, perUSD, services);
    const name = `aurelius-${scope}-${new Date().toISOString().slice(0, 10)}.${format}`;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
