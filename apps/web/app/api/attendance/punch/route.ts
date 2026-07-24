import { NextResponse } from "next/server";
import {
  ingestDevicePunches,
  parseDevicePunchBody,
} from "@/lib/hr/attendance-device-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Device agent ingest — ZKTeco (or similar) POSTs punches from the restaurant PC.
 *
 * POST /api/attendance/punch
 * Body: { venue, secret, punches: [{ employee_id, employee_name?, timestamp, punch_type?, device_serial? }] }
 * Response: { status: "ok", received: N }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseDevicePunchBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await ingestDevicePunches(parsed.data);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      status: "ok",
      received: result.received,
    });
  } catch (err) {
    console.error("[api/attendance/punch]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Punch ingest failed",
      },
      { status: 500 },
    );
  }
}
