import { NextResponse } from "next/server";
import { diagnosePersistenceAccess } from "@/lib/auth/action-context";

export const dynamic = "force-dynamic";

/** Auth-required JSON diagnostic for Vercel env / service-role / venue scope. */
export async function GET() {
  const report = await diagnosePersistenceAccess();
  if (!report.userId) {
    return NextResponse.json(
      { error: "Sign in required.", ...report },
      { status: 401 },
    );
  }
  return NextResponse.json(report);
}
