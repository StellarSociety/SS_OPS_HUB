import { redirect } from "next/navigation";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { createServiceClient } from "@/lib/supabase/service";
import { canEditLogs } from "./permissions";
import { ensureDefaultLogTypes, listLogDatesWithEntries, listLogRecords, listLogTypes } from "./store";
import type { SaveLogRecord, SaveLogType } from "./types";

export async function getSaveLogPageContext() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  if (!venue.is_global) {
    const service = createServiceClient();
    await ensureDefaultLogTypes(service, venue.id).catch(() => {
      // Defaults are best-effort until the venue uploads its first log.
    });
  }

  return { supabase, venue, permissions: permissions ?? [], user };
}

export async function getSaveLogDashboardPage() {
  const ctx = await getSaveLogPageContext();
  const today = new Date();
  const toDate = isoFromDate(today);
  const from = new Date(today);
  from.setDate(from.getDate() - 6);
  const fromDate = isoFromDate(from);

  const [types, weekRecords, monthRecords] = await Promise.all([
    listLogTypes(ctx.supabase, ctx.venue.id).catch(() => [] as SaveLogType[]),
    listLogRecords(ctx.supabase, ctx.venue.id, { fromDate, toDate }).catch(
      () => [] as SaveLogRecord[],
    ),
    listLogRecords(ctx.supabase, ctx.venue.id, {
      fromDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
      toDate,
    }).catch(() => [] as SaveLogRecord[]),
  ]);

  return {
    ...ctx,
    types,
    weekRecords,
    monthRecords,
    today: toDate,
  };
}

export async function getSaveLogLogsPage(logDate: string) {
  const ctx = await getSaveLogPageContext();
  const [types, records, datesWithEntries] = await Promise.all([
    listLogTypes(ctx.supabase, ctx.venue.id).catch(() => [] as SaveLogType[]),
    listLogRecords(ctx.supabase, ctx.venue.id, { logDate }).catch(
      () => [] as SaveLogRecord[],
    ),
    listLogDatesWithEntries(ctx.supabase, ctx.venue.id).catch(() => [] as string[]),
  ]);

  return {
    ...ctx,
    types,
    records,
    datesWithEntries,
    canEdit: canEditLogs(ctx.permissions, ctx.venue.id),
  };
}

function isoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
