import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getCatalogue, replaceCatalogue } from "@/lib/db/repo";
import { parseCatalogue } from "@/lib/services/catalogue-import";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { services, isStarter } = await getCatalogue();
    return NextResponse.json({ services, isStarter });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const { text, filename } = (await req.json()) as { text?: string; filename?: string };
    if (!text?.trim()) return NextResponse.json({ error: "Paste catalogue JSON/CSV or upload the architecture HTML." }, { status: 400 });
    const services = parseCatalogue(text, filename ?? "");
    if (services.length === 0) return NextResponse.json({ error: "No services could be parsed. Export the catalogue as JSON or CSV with at least a name column." }, { status: 400 });
    const n = await replaceCatalogue(services);
    return NextResponse.json({ imported: n, practiceAreas: new Set(services.map((s) => s.practiceArea)).size });
  } catch (e) {
    return apiError(e);
  }
}
