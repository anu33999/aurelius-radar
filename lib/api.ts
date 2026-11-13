import { NextResponse } from "next/server";

export function apiError(e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : "Unexpected error";
  const dbHint = /does not exist|no such table|Unable to open|not initialized|did not initialize|PrismaClient/i.test(msg)
    ? "Database is not initialised. Run `npx prisma generate` and `npx prisma db push`, then restart."
    : null;
  return NextResponse.json({ error: dbHint ?? msg }, { status });
}
