"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import {
  deleteVenueCashJournal,
  upsertVenueCashJournal,
} from "@/lib/sales/cash-journal-store";
import { replaceVenueCashExpenseLinesForDate } from "@/lib/sales/cash-expenses-store";
import type { VenueCashExpenseLineInput } from "@/lib/sales/cash-expenses-types";
import {
  deleteVenueDailyDiscounts,
  upsertVenueDailyDiscounts,
} from "@/lib/sales/discounts-store";
import {
  deleteVenueWaiter,
  reorderVenueWaiters,
  upsertVenueWaiter,
} from "@/lib/sales/waiters-store";
import type { VenueWaiterStatus } from "@/lib/sales/waiters-types";
import {
  deleteVenueDailySales,
  upsertVenueDailySales,
  upsertVenueSalesTaxSettings,
} from "@/lib/sales/daily-sales-store";
import { upsertVenueDailyTenderTotals } from "@/lib/sales/daily-tender-totals-store";
import type { TaxSettingsInput } from "@/lib/sales/daily-sales-types";
import { salesEntryCreateDateError } from "@/lib/sales/sales-entry-dates";
import {
  deleteVenueDailyVsWaitersComment,
  upsertVenueDailyVsWaitersComment,
} from "@/lib/sales/daily-vs-waiters-store";
import {
  deleteVenueDailySnapDiscountLine,
  deleteVenueDailySnapEvent,
  deleteVenueMonthlyForecast,
  upsertVenueDailySnapCashDrawer,
  upsertVenueDailySnapDiscountLine,
  upsertVenueDailySnapEvent,
  upsertVenueDailySnapNotes,
  upsertVenueMonthlyForecast,
} from "@/lib/sales/daily-snap-store";
import {
  deleteVenueTender,
  reorderVenueTenders,
  setVenueTenderStatus,
  setVenueTenderVoucherPaymentForm,
  upsertVenueTender,
} from "@/lib/sales/tenders-store";
import type { VenueTenderStatus } from "@/lib/sales/tenders-types";
import {
  deleteVenueWaiterDailySales,
  upsertVenueWaiterDailySales,
} from "@/lib/sales/waiter-sales-store";
import {
  deleteVenueVoucher,
  upsertVenueVoucher,
  upsertVenueVouchersBatch,
} from "@/lib/sales/vouchers-store";
import type { VoucherSource, VoucherStatus } from "@/lib/sales/vouchers-types";
import { VOUCHER_SOURCES, VOUCHER_STATUSES } from "@/lib/sales/vouchers-types";
import {
  upsertVenueWaiterSalesSettings,
} from "@/lib/sales/waiter-sales-settings-store";
import type { WaiterSalesSettingsInput } from "@/lib/sales/waiter-sales-settings-types";
import {
  canEditCashUp,
  canEditDailyVsWaiters,
  canEditDiscounts,
  canEditForecast,
  canEditVenueDaily,
  canEditVouchers,
  canEditWaiterDaily,
  canManageSalesWaiters,
} from "@/lib/sales/permissions";
import { SALES_MODULE_KEY } from "@/lib/sales/types";
import { createClient } from "@/lib/supabase/server";

const SALES_WAITERS_PATHS = [
  "/sales/settings/waiters",
  "/sales/settings/tenders",
  "/sales/settings/groups-charge",
  "/sales/settings/data-management",
  "/sales/settings/data-management/waiter-sales",
  "/sales/waiter/entry",
  "/sales/waiter/data",
  "/sales/waiter/insights",
  "/sales/vouchers",
];

function revalidateSalesWaiters() {
  for (const path of SALES_WAITERS_PATHS) {
    revalidatePath(path);
  }
}

const SALES_DISCOUNTS_PATHS = [
  "/sales/discounts",
  "/sales/discounts/data",
  "/sales/discounts/entry",
  "/sales/discounts/insights",
  "/sales/settings/data-management",
  "/sales/settings/data-management/discounts",
];

function revalidateSalesDiscounts() {
  for (const path of SALES_DISCOUNTS_PATHS) {
    revalidatePath(path);
  }
}

const SALES_CASH_JOURNAL_PATHS = [
  "/sales/cash",
  "/sales/cash/journal",
  "/sales/cash/data",
  "/sales/cash/expenses",
];

function revalidateSalesCashJournal() {
  for (const path of SALES_CASH_JOURNAL_PATHS) {
    revalidatePath(path);
  }
}

const SALES_DAILY_PATHS = [
  "/sales",
  "/sales/daily",
  "/sales/daily/data",
  "/sales/daily/entry",
  "/sales/daily/insights",
  "/sales/forecast",
  "/sales/vouchers",
  "/sales/settings",
  "/sales/settings/tax",
  "/sales/settings/data-management",
  "/sales/settings/data-management/daily-sales",
];

function revalidateSalesDaily() {
  for (const path of SALES_DAILY_PATHS) {
    revalidatePath(path);
  }
}

const SALES_DAILY_VS_WAITERS_PATHS = ["/sales/daily-vs-waiters"];

function revalidateSalesDailyVsWaiters() {
  for (const path of SALES_DAILY_VS_WAITERS_PATHS) {
    revalidatePath(path);
  }
}

const SALES_DAILY_SNAP_PATHS = [
  "/sales/daily-snap",
  "/sales/forecast",
];

function revalidateSalesDailySnap() {
  for (const path of SALES_DAILY_SNAP_PATHS) {
    revalidatePath(path);
  }
}

const SALES_VOUCHERS_PATHS = ["/sales/vouchers"];

function revalidateSalesVouchers() {
  for (const path of SALES_VOUCHERS_PATHS) {
    revalidatePath(path);
  }
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

function parseMoney(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function parseCount(value: unknown): number {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parseTaxPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000) / 1000;
}

export async function saveVenueDailySalesEntry(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVenueDaily(permissions, venue.id)) {
    return { error: "You do not have permission to edit daily sales." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const createDateError = salesEntryCreateDateError(saleDate, !id);
  if (createDateError) return { error: createDateError };

  try {
    const record = await upsertVenueDailySales(supabase, venue.id, user.id, {
      id,
      sale_date: saleDate,
      lunch_food_gs: parseMoney(formData.get("lunch_food_gs")),
      lunch_beverages_gs: parseMoney(formData.get("lunch_beverages_gs")),
      lunch_wine_gs: parseMoney(formData.get("lunch_wine_gs")),
      lunch_shisha_gs: parseMoney(formData.get("lunch_shisha_gs")),
      lunch_tobacco_gs: parseMoney(formData.get("lunch_tobacco_gs")),
      lunch_others_gs: parseMoney(formData.get("lunch_others_gs")),
      lunch_service_fees_gs: parseMoney(formData.get("lunch_service_fees_gs")),
      lunch_covers: parseCount(formData.get("lunch_covers")),
      lunch_bookings: parseCount(formData.get("lunch_bookings")),
      lunch_walkin_tables: parseCount(formData.get("lunch_walkin_tables")),
      lunch_walkin_covers: parseCount(formData.get("lunch_walkin_covers")),
      dinner_food_gs: parseMoney(formData.get("dinner_food_gs")),
      dinner_beverages_gs: parseMoney(formData.get("dinner_beverages_gs")),
      dinner_wine_gs: parseMoney(formData.get("dinner_wine_gs")),
      dinner_shisha_gs: parseMoney(formData.get("dinner_shisha_gs")),
      dinner_tobacco_gs: parseMoney(formData.get("dinner_tobacco_gs")),
      dinner_others_gs: parseMoney(formData.get("dinner_others_gs")),
      dinner_service_fees_gs: parseMoney(formData.get("dinner_service_fees_gs")),
      dinner_covers: parseCount(formData.get("dinner_covers")),
      dinner_bookings: parseCount(formData.get("dinner_bookings")),
      dinner_walkin_tables: parseCount(formData.get("dinner_walkin_tables")),
      dinner_walkin_covers: parseCount(formData.get("dinner_walkin_covers")),
      all_day_discount_gs: parseMoney(formData.get("all_day_discount_gs")),
      vat_collected_gs: parseMoney(formData.get("vat_collected_gs")),
      municipality_fee_collected_gs: parseMoney(
        formData.get("municipality_fee_collected_gs"),
      ),
      service_charge_collected_gs: parseMoney(
        formData.get("service_charge_collected_gs"),
      ),
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_sales",
      entity_id: record.id,
      venue_id: venue.id,
      after: { sale_date: saleDate },
    });

    revalidateSalesDaily();
    return { success: "Daily sales saved.", record };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A record already exists for this date."
        : "Could not save daily sales.";
    return { error: message };
  }
}

export async function saveVenueDailyTenderTotals(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVenueDaily(permissions, venue.id)) {
    return { error: "You do not have permission to edit daily sales." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const amountsByTender: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("tender_")) continue;
    const tenderId = key.slice("tender_".length);
    if (!tenderId) continue;
    amountsByTender[tenderId] = parseMoney(value);
  }

  try {
    const rows = await upsertVenueDailyTenderTotals(
      supabase,
      venue.id,
      user.id,
      saleDate,
      amountsByTender,
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_tender_totals",
      entity_id: saleDate,
      venue_id: venue.id,
      after: { sale_date: saleDate },
    });

    revalidateSalesDaily();
    return { success: "Daily tender totals saved.", rows };
  } catch {
    return { error: "Could not save daily tender totals." };
  }
}

export async function removeVenueDailySalesEntry(id: string) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVenueDaily(permissions, venue.id)) {
    return { error: "You do not have permission to delete daily sales." };
  }

  try {
    await deleteVenueDailySales(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_sales",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesDaily();
    return { success: "Daily sales entry removed." };
  } catch {
    return { error: "Could not delete daily sales entry." };
  }
}

export async function saveVenueSalesTaxSettings(input: TaxSettingsInput) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVenueDaily(permissions, venue.id)) {
    return { error: "You do not have permission to edit sales tax settings." };
  }

  const payload: TaxSettingsInput = {
    municipality_fee_pct: parseTaxPct(input.municipality_fee_pct),
    vat_pct: parseTaxPct(input.vat_pct),
    service_charge_pct: parseTaxPct(input.service_charge_pct),
    vat_on_service_charge_pct: parseTaxPct(input.vat_on_service_charge_pct),
  };

  try {
    const settings = await upsertVenueSalesTaxSettings(
      supabase,
      venue.id,
      payload,
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: SALES_MODULE_KEY,
      entity: "venue_sales_tax_settings",
      entity_id: venue.id,
      venue_id: venue.id,
      after: payload,
    });

    revalidateSalesDaily();
    return { success: "Sales tax settings saved.", settings };
  } catch {
    return { error: "Could not save sales tax settings." };
  }
}

export async function saveVenueCashJournalEntry(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  const canEdit =
    canEditCashUp(permissions, venue.id) ||
    canEditVenueDaily(permissions, venue.id);

  if (!canEdit) {
    return { error: "You do not have permission to edit the cash journal." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const createDateError = salesEntryCreateDateError(saleDate, !id);
  if (createDateError) return { error: createDateError };

  const openTillGs = parseMoney(formData.get("open_till_gs"));
  const cashWithdrawGs = parseMoney(formData.get("cash_withdraw_gs"));
  const cashExpensesGs = parseMoney(formData.get("cash_expenses_gs"));
  const cashDepositGs = parseMoney(formData.get("cash_deposit_gs"));
  const closingTillGs = parseMoney(formData.get("closing_till_gs"));
  const comments = String(formData.get("comments") ?? "").trim();
  const hasJournalData =
    cashWithdrawGs > 0 || cashExpensesGs > 0 || cashDepositGs > 0;
  const hasTillData = openTillGs > 0 || closingTillGs > 0;
  const hasComments = comments.length > 0;
  const hasData = hasJournalData || hasTillData || hasComments;
  const canSyncDailySnap = canEditCashUp(permissions, venue.id);

  try {
    if (canSyncDailySnap) {
      await upsertVenueDailySnapCashDrawer(supabase, venue.id, user.id, {
        sale_date: saleDate,
        cash_drawer_opening_gs: openTillGs,
        cash_drawer_closing_gs: closingTillGs,
      });
      await writeAuditLog({
        actor_id: user.id,
        action: "update",
        module_key: SALES_MODULE_KEY,
        entity: "venue_daily_snap_notes",
        venue_id: venue.id,
        after: {
          sale_date: saleDate,
          cash_drawer_opening_gs: openTillGs,
          cash_drawer_closing_gs: closingTillGs,
          source: "cash_journal",
        },
      });
    }

    if (!hasData) {
      if (id) {
        await deleteVenueCashJournal(supabase, venue.id, id);
        await writeAuditLog({
          actor_id: user.id,
          action: "delete",
          module_key: SALES_MODULE_KEY,
          entity: "venue_cash_journal",
          entity_id: id,
          venue_id: venue.id,
          after: { sale_date: saleDate },
        });
      }
      revalidateSalesCashJournal();
      revalidateSalesDailySnap();
      return {
        success: canSyncDailySnap
          ? "Till values synced to Daily Snap."
          : "Cash journal entry cleared.",
        record: null,
      };
    }

    const record = await upsertVenueCashJournal(supabase, venue.id, user.id, {
      id,
      sale_date: saleDate,
      open_till_gs: openTillGs,
      cash_withdraw_gs: cashWithdrawGs,
      cash_expenses_gs: cashExpensesGs,
      cash_deposit_gs: cashDepositGs,
      closing_till_gs: closingTillGs,
      comments,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_cash_journal",
      entity_id: record.id,
      venue_id: venue.id,
      after: { sale_date: saleDate },
    });

    revalidateSalesCashJournal();
    revalidateSalesDailySnap();
    return {
      success: canSyncDailySnap
        ? "Cash journal saved and till synced to Daily Snap."
        : "Cash journal saved.",
      record,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A cash journal entry already exists for this date."
        : "Could not save cash journal.";
    console.error("[saveVenueCashJournalEntry]", error);
    return { error: message };
  }
}

export async function removeVenueCashJournalEntry(id: string) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  const canEdit =
    canEditCashUp(permissions, venue.id) ||
    canEditVenueDaily(permissions, venue.id);

  if (!canEdit) {
    return { error: "You do not have permission to delete cash journal entries." };
  }

  try {
    await deleteVenueCashJournal(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_cash_journal",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesCashJournal();
    return { success: "Cash journal entry removed." };
  } catch {
    return { error: "Could not delete cash journal entry." };
  }
}

export async function saveVenueCashExpenseLines(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  const canEdit =
    canEditCashUp(permissions, venue.id) ||
    canEditVenueDaily(permissions, venue.id);

  if (!canEdit) {
    return { error: "You do not have permission to edit cash expenses." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Invalid expense references payload." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Invalid expense references payload." };
  }

  const lines: VenueCashExpenseLineInput[] = [];
  for (const [index, raw] of parsed.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const description = String(row.description ?? "").trim();
    const grossGs = parseMoney(row.gross_gs ?? row.grossGs);
    const vatGs = parseMoney(row.vat_gs ?? row.vatGs);
    const netGs = parseMoney(row.net_gs ?? row.netGs);
    const pchasePortal = Boolean(row.pchase_portal ?? row.pchasePortal);
    if (!description && grossGs <= 0 && vatGs <= 0 && netGs <= 0 && !pchasePortal) {
      continue;
    }
    if (grossGs < 0 || vatGs < 0 || netGs < 0) {
      return { error: "Expense amounts cannot be negative." };
    }
    lines.push({
      description,
      gross_gs: grossGs,
      vat_gs: vatGs,
      net_gs: netGs,
      pchase_portal: pchasePortal,
      sort_order: index,
    });
  }

  const createDateError = salesEntryCreateDateError(saleDate, lines.length > 0);
  if (createDateError) return { error: createDateError };

  try {
    const records = await replaceVenueCashExpenseLinesForDate(
      supabase,
      venue.id,
      user.id,
      saleDate,
      lines,
    );

    await writeAuditLog({
      actor_id: user.id,
      action: lines.length === 0 ? "delete" : "update",
      module_key: SALES_MODULE_KEY,
      entity: "venue_cash_expense_lines",
      entity_id: saleDate,
      venue_id: venue.id,
      after: { sale_date: saleDate, line_count: records.length },
    });

    revalidateSalesCashJournal();
    return {
      success:
        lines.length === 0
          ? "Cash expense references cleared."
          : "Cash expense references saved.",
      records,
    };
  } catch (error) {
    console.error("[saveVenueCashExpenseLines]", error);
    return { error: "Could not save cash expense references." };
  }
}

export async function saveVenueDailyDiscountsEntry(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditDiscounts(permissions, venue.id)) {
    return { error: "You do not have permission to edit discounts." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const createDateError = salesEntryCreateDateError(saleDate, !id);
  if (createDateError) return { error: createDateError };

  try {
    const record = await upsertVenueDailyDiscounts(supabase, venue.id, user.id, {
      id,
      sale_date: saleDate,
      food_discount_gs: parseMoney(formData.get("food_discount_gs")),
      beverages_discount_gs: parseMoney(formData.get("beverages_discount_gs")),
      wine_discount_gs: parseMoney(formData.get("wine_discount_gs")),
      shisha_discount_gs: parseMoney(formData.get("shisha_discount_gs")),
      others_discount_gs: parseMoney(formData.get("others_discount_gs")),
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_discounts",
      entity_id: record.id,
      venue_id: venue.id,
      after: { sale_date: saleDate },
    });

    revalidateSalesDiscounts();
    return { success: "Discounts saved.", record };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A discount record already exists for this date."
        : "Could not save discounts.";
    return { error: message };
  }
}

export async function removeVenueDailyDiscountsEntry(id: string) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditDiscounts(permissions, venue.id)) {
    return { error: "You do not have permission to delete discounts." };
  }

  try {
    await deleteVenueDailyDiscounts(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_discounts",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesDiscounts();
    return { success: "Discount entry removed." };
  } catch {
    return { error: "Could not delete discount entry." };
  }
}

function parseWaiterStatus(value: unknown): VenueWaiterStatus {
  return value === "inactive" ? "inactive" : "active";
}

export async function saveVenueWaiter(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to manage waiters." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Waiter name is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const position = String(formData.get("position") ?? "").trim();
  const status = parseWaiterStatus(formData.get("status"));
  const staffIdRaw = String(formData.get("staff_id") ?? "").trim();
  const staff_id = staffIdRaw || null;

  if (staff_id) {
    const { data: staffRow, error: staffError } = await supabase
      .from("staff")
      .select("id")
      .eq("id", staff_id)
      .eq("home_venue_id", venue.id)
      .maybeSingle();

    if (staffError || !staffRow) {
      return { error: "Selected HR staff was not found for this venue." };
    }

    const { data: linked } = await supabase
      .from("venue_waiters")
      .select("id, name")
      .eq("venue_id", venue.id)
      .eq("staff_id", staff_id)
      .maybeSingle();

    if (linked && linked.id !== id) {
      return {
        error: `${linked.name} is already linked to that HR staff member.`,
      };
    }
  }

  try {
    const waiter = await upsertVenueWaiter(supabase, venue.id, user.id, {
      id,
      name,
      position,
      status,
      staff_id,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_waiters",
      entity_id: waiter.id,
      venue_id: venue.id,
      after: { name, position, status, staff_id },
    });

    revalidateSalesWaiters();
    return { success: id ? "Waiter updated." : "Waiter added.", waiter };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A waiter with this name already exists."
        : "Could not save waiter.";
    return { error: message };
  }
}

export async function removeVenueWaiter(id: string) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to delete waiters." };
  }

  try {
    await deleteVenueWaiter(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_waiters",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesWaiters();
    return { success: "Waiter removed." };
  } catch {
    return { error: "Could not delete waiter." };
  }
}

export async function reorderVenueWaitersAction(orderedIds: string[]) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to manage waiters." };
  }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: "Invalid waiter order." };
  }

  try {
    await reorderVenueWaiters(supabase, venue.id, user.id, orderedIds);
    revalidateSalesWaiters();
    return { success: "Waiter order updated." };
  } catch {
    return { error: "Could not update waiter order." };
  }
}

function parseTenderStatus(value: unknown): VenueTenderStatus {
  return value === "inactive" ? "inactive" : "active";
}

export async function saveVenueTender(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to manage tenders." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Tender name is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const status = parseTenderStatus(formData.get("status"));
  const sortOrder = Number.parseInt(String(formData.get("sort_order") ?? "0"), 10);
  const voucherPaymentRaw = formData.get("voucher_payment_form");
  const voucherPaymentForm =
    voucherPaymentRaw === null || voucherPaymentRaw === undefined
      ? undefined
      : voucherPaymentRaw === "true" || voucherPaymentRaw === "on" || voucherPaymentRaw === "1";

  try {
    const tender = await upsertVenueTender(supabase, venue.id, user.id, {
      id,
      name,
      status,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      voucher_payment_form: voucherPaymentForm,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_tenders",
      entity_id: tender.id,
      venue_id: venue.id,
      after: {
        name,
        status,
        voucher_payment_form: tender.voucher_payment_form,
      },
    });

    revalidateSalesWaiters();
    return { success: id ? "Tender updated." : "Tender added.", tender };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A tender with this name already exists."
        : "Could not save tender.";
    return { error: message };
  }
}

export async function removeVenueTender(id: string) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to delete tenders." };
  }

  try {
    await deleteVenueTender(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_tenders",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesWaiters();
    return { success: "Tender removed." };
  } catch {
    return {
      error:
        "Could not delete tender. It may be used on existing waiter sales entries.",
    };
  }
}

export async function reorderVenueTendersAction(orderedIds: string[]) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to manage tenders." };
  }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: "Invalid tender order." };
  }

  try {
    await reorderVenueTenders(supabase, venue.id, user.id, orderedIds);
    revalidateSalesWaiters();
    return { success: "Tender order updated." };
  } catch {
    return { error: "Could not update tender order." };
  }
}

export async function setVenueTenderStatusAction(
  tenderId: string,
  status: VenueTenderStatus,
) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to manage tenders." };
  }

  const id = String(tenderId ?? "").trim();
  if (!id) return { error: "Tender is required." };

  const nextStatus = parseTenderStatus(status);

  try {
    const tender = await setVenueTenderStatus(
      supabase,
      venue.id,
      user.id,
      id,
      nextStatus,
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: SALES_MODULE_KEY,
      entity: "venue_tenders",
      entity_id: tender.id,
      venue_id: venue.id,
      after: {
        name: tender.name,
        status: tender.status,
      },
    });

    revalidateSalesWaiters();
    revalidatePath("/sales/daily/entry");
    revalidatePath("/sales/waiter/entry");
    return {
      success:
        nextStatus === "active"
          ? "Tender activated."
          : "Tender deactivated.",
      tender,
    };
  } catch {
    return { error: "Could not update tender status." };
  }
}

export async function setVenueTenderVoucherPaymentFormAction(
  tenderId: string,
  voucherPaymentForm: boolean,
) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to manage tenders." };
  }

  const id = String(tenderId ?? "").trim();
  if (!id) return { error: "Tender is required." };

  try {
    const tender = await setVenueTenderVoucherPaymentForm(
      supabase,
      venue.id,
      user.id,
      id,
      Boolean(voucherPaymentForm),
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: SALES_MODULE_KEY,
      entity: "venue_tenders",
      entity_id: tender.id,
      venue_id: venue.id,
      after: {
        name: tender.name,
        voucher_payment_form: tender.voucher_payment_form,
      },
    });

    revalidateSalesWaiters();
    revalidatePath("/sales/daily/entry");
    return { success: "Voucher payment form updated.", tender };
  } catch {
    return { error: "Could not update voucher payment form setting." };
  }
}

export async function saveVenueWaiterSalesSettings(input: WaiterSalesSettingsInput) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canManageSalesWaiters(permissions, venue.id)) {
    return {
      error: "You do not have permission to edit waiter sales settings.",
    };
  }

  const payload: WaiterSalesSettingsInput = {
    groups_added_service_charge_pct: parseTaxPct(
      input.groups_added_service_charge_pct,
    ),
  };

  try {
    const settings = await upsertVenueWaiterSalesSettings(
      supabase,
      venue.id,
      payload,
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: SALES_MODULE_KEY,
      entity: "venue_waiter_sales_settings",
      entity_id: venue.id,
      venue_id: venue.id,
      after: payload,
    });

    revalidateSalesWaiters();
    return { success: "Waiter sales settings saved.", settings };
  } catch {
    return { error: "Could not save waiter sales settings." };
  }
}

export async function saveVenueWaiterDailySalesEntry(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditWaiterDaily(permissions, venue.id)) {
    return { error: "You do not have permission to edit waiter sales." };
  }

  const waiterId = String(formData.get("waiter_id") ?? "").trim();
  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!waiterId) return { error: "A waiter must be selected." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const createDateError = salesEntryCreateDateError(saleDate, !id);
  if (createDateError) return { error: createDateError };

  const tenderAmounts: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("tender_")) {
      const tenderId = key.slice("tender_".length);
      tenderAmounts[tenderId] = parseMoney(value);
    }
  }

  try {
    const record = await upsertVenueWaiterDailySales(supabase, venue.id, user.id, {
      id,
      waiter_id: waiterId,
      sale_date: saleDate,
      total_sales_gs: parseMoney(formData.get("total_sales_gs")),
      total_payments_gs: parseMoney(formData.get("total_payments_gs")),
      gratuity_cc_gs: parseMoney(formData.get("gratuity_cc_gs")),
      gratuity_cash_gs: parseMoney(formData.get("gratuity_cash_gs")),
      groups_service_charge_gs: parseMoney(
        formData.get("groups_service_charge_gs"),
      ),
      total_covers: parseCount(formData.get("total_covers")),
      total_discounts_gs: parseMoney(formData.get("total_discounts_gs")),
      voucher_comments: String(formData.get("voucher_comments") ?? "").trim(),
      deposit_comments: String(formData.get("deposit_comments") ?? "").trim(),
      on_accounts_comments: String(
        formData.get("on_accounts_comments") ?? "",
      ).trim(),
      tender_amounts: tenderAmounts,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_waiter_daily_sales",
      entity_id: record.id,
      venue_id: venue.id,
      after: { waiter_id: waiterId, sale_date: saleDate },
    });

    revalidateSalesWaiters();
    return { success: "Waiter sales saved.", record };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("unique")
        ? "A record already exists for this waiter and date."
        : "Could not save waiter sales.";
    return { error: message };
  }
}

export async function removeVenueWaiterDailySalesEntry(id: string) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditWaiterDaily(permissions, venue.id)) {
    return { error: "You do not have permission to delete waiter sales." };
  }

  try {
    await deleteVenueWaiterDailySales(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_waiter_daily_sales",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesWaiters();
    return { success: "Waiter sales entry removed." };
  } catch {
    return { error: "Could not delete waiter sales entry." };
  }
}

export async function saveVenueDailyVsWaitersComment(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditDailyVsWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to edit reconciliation comments." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const createDateError = salesEntryCreateDateError(saleDate, !id);
  if (createDateError) return { error: createDateError };

  const commentText = String(formData.get("comment_text") ?? "");

  try {
    const record = await upsertVenueDailyVsWaitersComment(
      supabase,
      venue.id,
      user.id,
      {
        id,
        sale_date: saleDate,
        comment_text: commentText,
      },
    );

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_vs_waiters_comments",
      entity_id: record?.id ?? id ?? saleDate,
      venue_id: venue.id,
      after: { sale_date: saleDate },
    });

    revalidateSalesDailyVsWaiters();
    return { success: "Comment saved.", record };
  } catch {
    return { error: "Could not save comment." };
  }
}

export async function removeVenueDailyVsWaitersComment(id: string) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditDailyVsWaiters(permissions, venue.id)) {
    return { error: "You do not have permission to delete reconciliation comments." };
  }

  try {
    await deleteVenueDailyVsWaitersComment(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_vs_waiters_comments",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesDailyVsWaiters();
    return { success: "Comment removed." };
  } catch {
    return { error: "Could not delete comment." };
  }
}

export async function saveVenueDailySnapNotes(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditCashUp(permissions, venue.id)) {
    return { error: "You do not have permission to edit Daily Snap notes." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;

  try {
    const record = await upsertVenueDailySnapNotes(supabase, venue.id, user.id, {
      id,
      sale_date: saleDate,
      eighty_six_lunch: String(formData.get("eighty_six_lunch") ?? ""),
      eighty_six_dinner: String(formData.get("eighty_six_dinner") ?? ""),
      service_comments_lunch: String(formData.get("service_comments_lunch") ?? ""),
      service_comments_dinner: String(formData.get("service_comments_dinner") ?? ""),
      cash_drawer_opening_gs: parseMoney(formData.get("cash_drawer_opening_gs")),
      cash_drawer_closing_gs: parseMoney(formData.get("cash_drawer_closing_gs")),
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_snap_notes",
      entity_id: record.id,
      venue_id: venue.id,
      after: { sale_date: saleDate },
    });
    revalidateSalesDailySnap();
    return { success: "Daily Snap notes saved." };
  } catch {
    return { error: "Could not save Daily Snap notes." };
  }
}

export async function saveVenueDailySnapDiscountLine(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditCashUp(permissions, venue.id)) {
    return { error: "You do not have permission to edit discount details." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;

  try {
    const record = await upsertVenueDailySnapDiscountLine(
      supabase,
      venue.id,
      user.id,
      {
        id,
        sale_date: saleDate,
        table_number: String(formData.get("table_number") ?? ""),
        time_of_day: String(formData.get("time_of_day") ?? ""),
        guest_name: String(formData.get("guest_name") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        amount_gs: parseMoney(formData.get("amount_gs")),
        sort_order: parseCount(formData.get("sort_order")),
      },
    );

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_snap_discount_lines",
      entity_id: record.id,
      venue_id: venue.id,
      after: { sale_date: saleDate },
    });
    revalidateSalesDailySnap();
    return { success: "Discount line saved.", id: record.id };
  } catch {
    return { error: "Could not save discount line." };
  }
}

export async function removeVenueDailySnapDiscountLine(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditCashUp(permissions, venue.id)) {
    return { error: "You do not have permission to delete discount details." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Discount line id is required." };

  try {
    await deleteVenueDailySnapDiscountLine(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_snap_discount_lines",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesDailySnap();
    return { success: "Discount line removed." };
  } catch {
    return { error: "Could not delete discount line." };
  }
}

export async function saveVenueDailySnapEvent(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditCashUp(permissions, venue.id)) {
    return { error: "You do not have permission to edit events." };
  }

  const saleDate = String(formData.get("sale_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return { error: "A valid sale date is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;

  try {
    const record = await upsertVenueDailySnapEvent(supabase, venue.id, user.id, {
      id,
      sale_date: saleDate,
      event_name: String(formData.get("event_name") ?? ""),
      guest_count: parseCount(formData.get("guest_count")),
      package_name: String(formData.get("package_name") ?? ""),
      total_pay_gs: parseMoney(formData.get("total_pay_gs")),
      service_comments: String(formData.get("service_comments") ?? ""),
      sort_order: parseCount(formData.get("sort_order")),
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_snap_events",
      entity_id: record.id,
      venue_id: venue.id,
      after: { sale_date: saleDate, event_name: record.event_name },
    });
    revalidateSalesDailySnap();
    return { success: "Event saved.", id: record.id };
  } catch {
    return { error: "Could not save event." };
  }
}

export async function removeVenueDailySnapEvent(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditCashUp(permissions, venue.id)) {
    return { error: "You do not have permission to delete events." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Event id is required." };

  try {
    await deleteVenueDailySnapEvent(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_daily_snap_events",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesDailySnap();
    return { success: "Event removed." };
  } catch {
    return { error: "Could not delete event." };
  }
}

export async function saveVenueMonthlyForecast(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditForecast(permissions, venue.id)) {
    return { error: "You do not have permission to edit monthly forecasts." };
  }

  const monthKey = String(formData.get("month_key") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return { error: "A valid month is required." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;

  try {
    const record = await upsertVenueMonthlyForecast(supabase, venue.id, user.id, {
      id,
      month_key: monthKey,
      forecast_revenue_gs: parseMoney(formData.get("forecast_revenue_gs")),
      forecast_covers: parseCount(formData.get("forecast_covers")),
      forecast_venue_asph: parseMoney(formData.get("forecast_venue_asph")),
      forecast_food_asph: parseMoney(formData.get("forecast_food_asph")),
      forecast_beverages_asph: parseMoney(formData.get("forecast_beverages_asph")),
      forecast_wine_asph: parseMoney(formData.get("forecast_wine_asph")),
      forecast_shisha_asph: parseMoney(formData.get("forecast_shisha_asph")),
      forecast_other_asph: parseMoney(formData.get("forecast_other_asph")),
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_monthly_forecasts",
      entity_id: record.id,
      venue_id: venue.id,
      after: { month_key: monthKey },
    });
    revalidateSalesDailySnap();
    return { success: "Forecast saved." };
  } catch {
    return { error: "Could not save forecast." };
  }
}

export async function removeVenueMonthlyForecast(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditForecast(permissions, venue.id)) {
    return { error: "You do not have permission to delete forecasts." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Forecast id is required." };

  try {
    await deleteVenueMonthlyForecast(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_monthly_forecasts",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesDailySnap();
    return { success: "Forecast removed." };
  } catch {
    return { error: "Could not delete forecast." };
  }
}

function parseVoucherStatus(value: unknown): VoucherStatus {
  const status = String(value ?? "").trim();
  if ((VOUCHER_STATUSES as readonly string[]).includes(status)) {
    return status as VoucherStatus;
  }
  return "issued";
}

function parseVoucherSource(value: unknown): VoucherSource {
  const source = String(value ?? "").trim();
  if ((VOUCHER_SOURCES as readonly string[]).includes(source)) {
    return source as VoucherSource;
  }
  return "manual";
}

function parseOptionalDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export async function saveVenueVoucher(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVouchers(permissions, venue.id)) {
    return { error: "You do not have permission to edit vouchers." };
  }

  const voucherNumber = String(formData.get("voucher_number") ?? "").trim();
  if (!voucherNumber) return { error: "Voucher number is required." };

  const issuedDate = String(formData.get("issued_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedDate)) {
    return { error: "A valid issued date is required." };
  }

  const status = parseVoucherStatus(formData.get("status"));
  const redeemedDate = parseOptionalDate(formData.get("redeemed_date"));
  if (status === "redeemed" && !redeemedDate) {
    return { error: "Redeemed date is required when status is Redeemed." };
  }

  const id = String(formData.get("id") ?? "").trim() || undefined;

  try {
    const record = await upsertVenueVoucher(supabase, venue.id, user.id, {
      id,
      voucher_number: voucherNumber,
      voucher_name: String(formData.get("voucher_name") ?? ""),
      face_value_gs: parseMoney(formData.get("face_value_gs")),
      status,
      issued_date: issuedDate,
      redeemed_date: redeemedDate,
      expires_date: parseOptionalDate(formData.get("expires_date")),
      payment_form_tender_id:
        String(formData.get("payment_form_tender_id") ?? "").trim() || null,
      purchaser_name: String(formData.get("purchaser_name") ?? ""),
      recipient_name: String(formData.get("recipient_name") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      source: parseVoucherSource(formData.get("source")),
      source_waiter_sales_id:
        String(formData.get("source_waiter_sales_id") ?? "").trim() || null,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_vouchers",
      entity_id: record.id,
      venue_id: venue.id,
    });
    revalidateSalesVouchers();
    return { success: id ? "Voucher updated." : "Voucher created.", record };
  } catch (error) {
    const message =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (message === "23505") {
      return { error: "A voucher with this number already exists." };
    }
    console.error("[saveVenueVoucher]", error);
    return { error: "Could not save voucher." };
  }
}

export async function removeVenueVoucher(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVouchers(permissions, venue.id)) {
    return { error: "You do not have permission to delete vouchers." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Voucher id is required." };

  try {
    await deleteVenueVoucher(supabase, venue.id, id);
    await writeAuditLog({
      actor_id: user.id,
      action: "delete",
      module_key: SALES_MODULE_KEY,
      entity: "venue_vouchers",
      entity_id: id,
      venue_id: venue.id,
    });
    revalidateSalesVouchers();
    return { success: "Voucher deleted." };
  } catch (error) {
    console.error("[removeVenueVoucher]", error);
    return { error: "Could not delete voucher." };
  }
}

export async function markVenueVoucherRedeemed(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVouchers(permissions, venue.id)) {
    return { error: "You do not have permission to edit vouchers." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Voucher id is required." };

  const redeemedDate =
    parseOptionalDate(formData.get("redeemed_date")) ??
    new Date().toISOString().slice(0, 10);

  try {
    const { data: existing, error } = await supabase
      .from("venue_vouchers")
      .select("*")
      .eq("id", id)
      .eq("venue_id", venue.id)
      .single();

    if (error || !existing) {
      return { error: "Voucher not found." };
    }

    const record = await upsertVenueVoucher(supabase, venue.id, user.id, {
      id,
      voucher_number: existing.voucher_number,
      voucher_name: existing.voucher_name ?? "",
      face_value_gs: Number(existing.face_value_gs),
      status: "redeemed",
      issued_date: existing.issued_date,
      redeemed_date: redeemedDate,
      expires_date: existing.expires_date ?? null,
      payment_form_tender_id: existing.payment_form_tender_id ?? null,
      purchaser_name: existing.purchaser_name ?? "",
      recipient_name: existing.recipient_name ?? "",
      notes: existing.notes ?? "",
      source: parseVoucherSource(existing.source),
      source_waiter_sales_id: existing.source_waiter_sales_id ?? null,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: SALES_MODULE_KEY,
      entity: "venue_vouchers",
      entity_id: record.id,
      venue_id: venue.id,
      after: { status: "redeemed", redeemed_date: redeemedDate },
    });
    revalidateSalesVouchers();
    return { success: "Voucher marked as redeemed.", record };
  } catch (error) {
    console.error("[markVenueVoucherRedeemed]", error);
    return { error: "Could not redeem voucher." };
  }
}

export async function importWaiterVoucherSuggestions(formData: FormData) {
  const { supabase, user, venue, permissions } = await getSalesAuthContext();

  if (!canEditVouchers(permissions, venue.id)) {
    return { error: "You do not have permission to import vouchers." };
  }

  const raw = String(formData.get("payload") ?? "").trim();
  if (!raw) return { error: "Nothing to import." };

  let items: Array<{
    voucher_number: string;
    voucher_name: string;
    face_value_gs: number;
    issued_date: string;
    source_waiter_sales_id?: string | null;
  }>;

  try {
    items = JSON.parse(raw) as typeof items;
  } catch {
    return { error: "Invalid import payload." };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Nothing to import." };
  }

  try {
    const records = await upsertVenueVouchersBatch(
      supabase,
      venue.id,
      user.id,
      items.map((item) => ({
        voucher_number: String(item.voucher_number ?? "").trim(),
        voucher_name: String(item.voucher_name ?? "").trim(),
        face_value_gs: parseMoney(item.face_value_gs),
        status: "issued" as const,
        issued_date: String(item.issued_date ?? "").trim(),
        redeemed_date: null,
        expires_date: null,
        payment_form_tender_id: null,
        purchaser_name: "",
        recipient_name: "",
        notes: "Imported from waiter Voucher Issue comments.",
        source: "waiter_comment" as const,
        source_waiter_sales_id: item.source_waiter_sales_id ?? null,
      })),
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_vouchers",
      venue_id: venue.id,
      after: { imported: records.length, source: "waiter_comment" },
    });
    revalidateSalesVouchers();
    return {
      success: `Imported ${records.length} voucher${records.length === 1 ? "" : "s"}.`,
      count: records.length,
    };
  } catch (error) {
    const message =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (message === "23505") {
      return { error: "One or more voucher numbers already exist." };
    }
    console.error("[importWaiterVoucherSuggestions]", error);
    return { error: "Could not import vouchers." };
  }
}