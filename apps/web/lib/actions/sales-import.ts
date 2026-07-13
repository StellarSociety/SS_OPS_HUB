"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import type { DailySalesImportPayload } from "@/lib/sales/daily-sales-import";
import type { DiscountsImportPayload } from "@/lib/sales/discounts-import";
import { isFutureSalesEntryDate } from "@/lib/sales/sales-entry-dates";
import {
  canEditDiscounts,
  canEditVenueDaily,
  canEditWaiterDaily,
} from "@/lib/sales/permissions";
import { SALES_MODULE_KEY } from "@/lib/sales/types";
import type { WaiterSalesImportPayload } from "@/lib/sales/waiter-sales-import";
import { createClient } from "@/lib/supabase/server";

const IMPORT_BATCH_SIZE = 100;

const SALES_DATA_MANAGEMENT_PATHS = [
  "/sales/settings/data-management",
  "/sales/settings/data-management/daily-sales",
  "/sales/settings/data-management/waiter-sales",
  "/sales/settings/data-management/discounts",
];

const SALES_DISCOUNTS_PATHS = [
  "/sales/discounts",
  "/sales/discounts/data",
  "/sales/discounts/entry",
  "/sales/settings/data-management",
  "/sales/settings/data-management/discounts",
];

const SALES_DAILY_PATHS = [
  "/sales/daily",
  "/sales/daily/data",
  "/sales/daily/entry",
  "/sales/daily-vs-waiters",
];

const SALES_WAITERS_PATHS = [
  "/sales/waiter/entry",
  "/sales/waiter/data",
  "/sales/daily-vs-waiters",
];

function revalidateDailySalesImport() {
  for (const path of [...SALES_DATA_MANAGEMENT_PATHS, ...SALES_DAILY_PATHS]) {
    revalidatePath(path);
  }
}

function revalidateWaiterSalesImport() {
  for (const path of [...SALES_DATA_MANAGEMENT_PATHS, ...SALES_WAITERS_PATHS]) {
    revalidatePath(path);
  }
}

function revalidateDiscountsImport() {
  for (const path of [...SALES_DATA_MANAGEMENT_PATHS, ...SALES_DISCOUNTS_PATHS]) {
    revalidatePath(path);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function getSalesAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, user, venue, permissions: permissions ?? [] };
}

function dailySalesRowError(saleDate: string, error: unknown) {
  return error instanceof Error && error.message.includes("unique")
    ? `Date ${saleDate}: a record already exists.`
    : `Date ${saleDate}: could not save.`;
}

function waiterSalesRowError(
  waiterId: string,
  saleDate: string,
  error: unknown,
) {
  return error instanceof Error && error.message.includes("unique")
    ? `Waiter ${waiterId} on ${saleDate}: a record already exists.`
    : `Waiter ${waiterId} on ${saleDate}: could not save.`;
}

function discountsRowError(saleDate: string, error: unknown) {
  return error instanceof Error && error.message.includes("unique")
    ? `Date ${saleDate}: a record already exists.`
    : `Date ${saleDate}: could not save.`;
}

export async function importDailySalesRows(rows: DailySalesImportPayload[]) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVenueDaily(permissions, venue.id)) {
    return { error: "You do not have permission to import daily sales." };
  }

  if (!rows.length) {
    return { error: "No rows to import." };
  }

  try {
    const { data: existingRows, error: existingError } = await supabase
      .from("venue_daily_sales")
      .select("id, sale_date")
      .eq("venue_id", venue.id);

    if (existingError) throw existingError;

    const existingByDate = new Map(
      (existingRows ?? []).map((record) => [record.sale_date, record.id]),
    );

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      const existingId = existingByDate.get(row.sale_date);
      if (!existingId && isFutureSalesEntryDate(row.sale_date)) {
        errors.push(
          `Date ${row.sale_date}: entries cannot be created for a future date.`,
        );
        continue;
      }

      const payload = {
        venue_id: venue.id,
        ...row,
        updated_by: user.id,
      };

      if (existingId) {
        toUpdate.push(payload);
      } else {
        toInsert.push({ ...payload, created_by: user.id });
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const batch of chunk(toInsert, IMPORT_BATCH_SIZE)) {
      const { error } = await supabase.from("venue_daily_sales").insert(batch);
      if (error) {
        for (const row of batch) {
          const saleDate = String(row.sale_date);
          try {
            const { error: rowError } = await supabase
              .from("venue_daily_sales")
              .insert(row);
            if (rowError) throw rowError;
            inserted += 1;
          } catch (rowFailure) {
            errors.push(dailySalesRowError(saleDate, rowFailure));
          }
        }
      } else {
        inserted += batch.length;
      }
    }

    for (const batch of chunk(toUpdate, IMPORT_BATCH_SIZE)) {
      const { error } = await supabase
        .from("venue_daily_sales")
        .upsert(batch, { onConflict: "venue_id,sale_date" });
      if (error) {
        for (const row of batch) {
          const saleDate = String(row.sale_date);
          try {
            const { error: rowError } = await supabase
              .from("venue_daily_sales")
              .upsert(row, { onConflict: "venue_id,sale_date" });
            if (rowError) throw rowError;
            updated += 1;
          } catch (rowFailure) {
            errors.push(dailySalesRowError(saleDate, rowFailure));
          }
        }
      } else {
        updated += batch.length;
      }
    }

    if (inserted + updated > 0) {
      await writeAuditLog({
        actor_id: user.id,
        action: "bulk_import",
        module_key: SALES_MODULE_KEY,
        entity: "venue_daily_sales",
        venue_id: venue.id,
        after: {
          source: "excel_import",
          inserted,
          updated,
          total: rows.length,
        },
      });
    }

    revalidateDailySalesImport();

    return {
      inserted,
      updated,
      total: rows.length,
      errors: errors.length ? errors : undefined,
    };
  } catch {
    return { error: "Could not import daily sales." };
  }
}

export async function importWaiterSalesRows(rows: WaiterSalesImportPayload[]) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditWaiterDaily(permissions, venue.id)) {
    return { error: "You do not have permission to import waiter sales." };
  }

  if (!rows.length) {
    return { error: "No rows to import." };
  }

  try {
    const { data: existingRows, error: existingError } = await supabase
      .from("venue_waiter_daily_sales")
      .select("id, waiter_id, sale_date")
      .eq("venue_id", venue.id);

    if (existingError) throw existingError;

    const salesIdByKey = new Map(
      (existingRows ?? []).map((record) => [
        `${record.waiter_id}:${record.sale_date}`,
        record.id,
      ]),
    );

    type WaiterImportRow = {
      key: string;
      payload: Record<string, unknown>;
      source: WaiterSalesImportPayload;
    };

    const toInsert: WaiterImportRow[] = [];
    const toUpdate: WaiterImportRow[] = [];
    const importRowByKey = new Map<string, WaiterSalesImportPayload>();
    const savedKeys = new Set<string>();
    const errors: string[] = [];

    for (const row of rows) {
      const key = `${row.waiter_id}:${row.sale_date}`;
      const existingId = salesIdByKey.get(key);

      if (!existingId && isFutureSalesEntryDate(row.sale_date)) {
        errors.push(
          `Waiter ${row.waiter_id} on ${row.sale_date}: entries cannot be created for a future date.`,
        );
        continue;
      }

      const { tender_amounts: _tenderAmounts, ...salesFields } = row;
      const payload = {
        venue_id: venue.id,
        ...salesFields,
        updated_by: user.id,
      };

      const importRow = {
        key,
        payload: existingId
          ? payload
          : { ...payload, created_by: user.id },
        source: row,
      };
      importRowByKey.set(key, row);

      if (existingId) {
        toUpdate.push(importRow);
      } else {
        toInsert.push(importRow);
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const batch of chunk(toInsert, IMPORT_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("venue_waiter_daily_sales")
        .insert(batch.map((row) => row.payload))
        .select("id, waiter_id, sale_date");

      if (error) {
        for (const row of batch) {
          const saleDate = String(row.payload.sale_date);
          const waiterId = String(row.payload.waiter_id);
          try {
            const { data: saved, error: rowError } = await supabase
              .from("venue_waiter_daily_sales")
              .insert(row.payload)
              .select("id, waiter_id, sale_date")
              .single();
            if (rowError) throw rowError;
            salesIdByKey.set(row.key, saved.id);
            savedKeys.add(row.key);
            inserted += 1;
          } catch (rowFailure) {
            errors.push(waiterSalesRowError(waiterId, saleDate, rowFailure));
          }
        }
      } else {
        for (const saved of data ?? []) {
          const key = `${saved.waiter_id}:${saved.sale_date}`;
          salesIdByKey.set(key, saved.id);
          savedKeys.add(key);
        }
        inserted += batch.length;
      }
    }

    for (const batch of chunk(toUpdate, IMPORT_BATCH_SIZE)) {
      const { error } = await supabase
        .from("venue_waiter_daily_sales")
        .upsert(batch.map((row) => row.payload), {
          onConflict: "venue_id,waiter_id,sale_date",
        });

      if (error) {
        for (const row of batch) {
          const saleDate = String(row.payload.sale_date);
          const waiterId = String(row.payload.waiter_id);
          try {
            const { error: rowError } = await supabase
              .from("venue_waiter_daily_sales")
              .upsert(row.payload, {
                onConflict: "venue_id,waiter_id,sale_date",
              });
            if (rowError) throw rowError;
            savedKeys.add(row.key);
            updated += 1;
          } catch (rowFailure) {
            errors.push(waiterSalesRowError(waiterId, saleDate, rowFailure));
          }
        }
      } else {
        for (const row of batch) {
          savedKeys.add(row.key);
        }
        updated += batch.length;
      }
    }

    const savedRows = [...savedKeys].map((key) => importRowByKey.get(key)!);
    const affectedSalesIds = savedRows.map((row) =>
      salesIdByKey.get(`${row.waiter_id}:${row.sale_date}`)!,
    );

    if (affectedSalesIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("venue_waiter_daily_tender_lines")
        .delete()
        .in("sales_id", affectedSalesIds);

      if (deleteError) throw deleteError;

      const tenderLines = savedRows.flatMap((row) => {
        const salesId = salesIdByKey.get(`${row.waiter_id}:${row.sale_date}`)!;
        return Object.entries(row.tender_amounts)
          .filter(([, amount]) => amount > 0)
          .map(([tender_id, amount_gs]) => ({
            sales_id: salesId,
            tender_id,
            amount_gs,
          }));
      });

      for (const batch of chunk(tenderLines, IMPORT_BATCH_SIZE)) {
        const { error: insertError } = await supabase
          .from("venue_waiter_daily_tender_lines")
          .insert(batch);
        if (insertError) throw insertError;
      }
    }

    if (inserted + updated > 0) {
      await writeAuditLog({
        actor_id: user.id,
        action: "bulk_import",
        module_key: SALES_MODULE_KEY,
        entity: "venue_waiter_daily_sales",
        venue_id: venue.id,
        after: {
          source: "excel_import",
          inserted,
          updated,
          total: rows.length,
        },
      });
    }

    revalidateWaiterSalesImport();

    return {
      inserted,
      updated,
      total: rows.length,
      errors: errors.length ? errors : undefined,
    };
  } catch {
    return { error: "Could not import waiter sales." };
  }
}

export async function importDiscountsRows(rows: DiscountsImportPayload[]) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditDiscounts(permissions, venue.id)) {
    return { error: "You do not have permission to import discounts." };
  }

  if (!rows.length) {
    return { error: "No rows to import." };
  }

  try {
    const { data: existingRows, error: existingError } = await supabase
      .from("venue_daily_discounts")
      .select("id, sale_date")
      .eq("venue_id", venue.id);

    if (existingError) throw existingError;

    const existingByDate = new Map(
      (existingRows ?? []).map((record) => [record.sale_date, record.id]),
    );

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      const existingId = existingByDate.get(row.sale_date);
      if (!existingId && isFutureSalesEntryDate(row.sale_date)) {
        errors.push(
          `Date ${row.sale_date}: entries cannot be created for a future date.`,
        );
        continue;
      }

      const payload = {
        venue_id: venue.id,
        ...row,
        updated_by: user.id,
      };

      if (existingId) {
        toUpdate.push(payload);
      } else {
        toInsert.push({ ...payload, created_by: user.id });
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const batch of chunk(toInsert, IMPORT_BATCH_SIZE)) {
      const { error } = await supabase.from("venue_daily_discounts").insert(batch);
      if (error) {
        for (const row of batch) {
          const saleDate = String(row.sale_date);
          try {
            const { error: rowError } = await supabase
              .from("venue_daily_discounts")
              .insert(row);
            if (rowError) throw rowError;
            inserted += 1;
          } catch (rowFailure) {
            errors.push(discountsRowError(saleDate, rowFailure));
          }
        }
      } else {
        inserted += batch.length;
      }
    }

    for (const batch of chunk(toUpdate, IMPORT_BATCH_SIZE)) {
      const { error } = await supabase
        .from("venue_daily_discounts")
        .upsert(batch, { onConflict: "venue_id,sale_date" });
      if (error) {
        for (const row of batch) {
          const saleDate = String(row.sale_date);
          try {
            const { error: rowError } = await supabase
              .from("venue_daily_discounts")
              .upsert(row, { onConflict: "venue_id,sale_date" });
            if (rowError) throw rowError;
            updated += 1;
          } catch (rowFailure) {
            errors.push(discountsRowError(saleDate, rowFailure));
          }
        }
      } else {
        updated += batch.length;
      }
    }

    if (inserted + updated > 0) {
      await writeAuditLog({
        actor_id: user.id,
        action: "bulk_import",
        module_key: SALES_MODULE_KEY,
        entity: "venue_daily_discounts",
        venue_id: venue.id,
        after: {
          source: "excel_import",
          inserted,
          updated,
          total: rows.length,
        },
      });
    }

    revalidateDiscountsImport();

    return {
      inserted,
      updated,
      total: rows.length,
      errors: errors.length ? errors : undefined,
    };
  } catch {
    return { error: "Could not import discounts." };
  }
}
