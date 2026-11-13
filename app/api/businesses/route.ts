import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createBusiness, deleteBusiness, listBusinesses, updateBusiness } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const skip = Math.max(Number(sp.get("offset")) || 0, 0);
    const take = Math.min(Math.max(Number(sp.get("limit")) || 1000, 1), 2000);
    const businesses = await listBusinesses({
      q: sp.get("q") || undefined,
      city: sp.get("city") || undefined,
      country: sp.get("country") || undefined,
      locality: sp.get("locality") || undefined,
      stage: sp.get("stage") || undefined,
      industry: sp.get("industry") || undefined,
    }, { skip, take });
    // The client keeps asking for the next page until hasMore is false.
    return NextResponse.json({ businesses, hasMore: businesses.length === take });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    return NextResponse.json({ business: await createBusiness(body) });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, ...patch } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json({ business: await updateBusiness(id, patch) });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await deleteBusiness(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
