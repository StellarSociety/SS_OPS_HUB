import { NextResponse } from "next/server";
import { processDueWorkAnniversaryEmails } from "@/lib/hr/process-work-anniversary-emails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/work-anniversary-emails] CRON_SECRET is not set.");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  return querySecret === secret;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueWorkAnniversaryEmails({ limit: 50 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/work-anniversary-emails]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Process failed" },
      { status: 500 },
    );
  }
}
