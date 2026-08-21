import type { SupabaseClient } from "@supabase/supabase-js";
import { getSalesDataLoadErrorMessage } from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import { listVenueDailySnapReportStatus } from "@/lib/sales/daily-snap-store";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import {
  buildSalesEntryStatusDays,
  getSalesEntryStatusDates,
  type SalesEntryStatusDay,
  type SnapReportStatusForDay,
} from "@/lib/sales/sales-entry-status";
import { listActiveVenueTenders } from "@/lib/sales/tenders-store";
import type { VenueTender } from "@/lib/sales/tenders-types";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import { listVenueWaiters } from "@/lib/sales/waiters-store";

export type SalesOverviewPayload = {
  records: VenueDailySalesRecord[];
  totalTaxPct: number;
  waiterRecords: VenueWaiterDailySalesEntry[];
  tenders: VenueTender[];
  entryStatusDays: SalesEntryStatusDay[];
};

export type SalesOverviewResult =
  | { ok: true; data: SalesOverviewPayload }
  | { ok: false; reason: "schema_missing" | "error" };

export async function loadSalesOverviewData(
  supabase: SupabaseClient,
  venueId: string,
): Promise<SalesOverviewResult> {
  try {
    const statusDates = getSalesEntryStatusDates(6);
    const [
      records,
      taxSettings,
      waiterRecords,
      waiters,
      tenders,
      discountsRecords,
      snapReportStatus,
    ] = await Promise.all([
      listVenueDailySales(supabase, venueId),
      getVenueSalesTaxSettings(supabase, venueId),
      listVenueWaiterDailySales(supabase, venueId),
      listVenueWaiters(supabase, venueId),
      listActiveVenueTenders(supabase, venueId),
      listVenueDailyDiscounts(supabase, venueId),
      listVenueDailySnapReportStatus(supabase, venueId, statusDates),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    const editorIds = Array.from(
      new Set(
        Array.from(snapReportStatus.values())
          .map((status) => status.lastEditorId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const editorNameById = new Map<string, string>();
    if (editorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", editorIds);
      for (const profile of profiles ?? []) {
        const name =
          (profile.full_name as string | null)?.trim() ||
          (profile.email as string | null)?.trim() ||
          null;
        if (name) editorNameById.set(profile.id as string, name);
      }
    }

    const snapStatusByDate = new Map<string, SnapReportStatusForDay>();
    for (const [date, status] of snapReportStatus) {
      snapStatusByDate.set(date, {
        hasReport: status.hasReport,
        editorName: status.lastEditorId
          ? editorNameById.get(status.lastEditorId) ?? null
          : null,
      });
    }

    return {
      ok: true,
      data: {
        records,
        totalTaxPct,
        waiterRecords,
        tenders,
        entryStatusDays: buildSalesEntryStatusDays({
          dailyRecords: records,
          waiterRecords,
          waiters,
          discountsRecords,
          snapStatusByDate,
          totalTaxPct,
          count: 6,
        }),
      },
    };
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return { ok: false, reason: "schema_missing" };
    }
    console.error("[sales/overview]", error);
    return { ok: false, reason: "error" };
  }
}
