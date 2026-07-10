"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
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
import type { TaxSettingsInput } from "@/lib/sales/daily-sales-types";
import {
  deleteVenueDailyVsWaitersComment,
  upsertVenueDailyVsWaitersComment,
} from "@/lib/sales/daily-vs-waiters-store";
import {
  deleteVenueTender,
  reorderVenueTenders,
  upsertVenueTender,
} from "@/lib/sales/tenders-store";
import type { VenueTenderStatus } from "@/lib/sales/tenders-types";
import {
  deleteVenueWaiterDailySales,
  upsertVenueWaiterDailySales,
} from "@/lib/sales/waiter-sales-store";
import {
  upsertVenueWaiterSalesSettings,
} from "@/lib/sales/waiter-sales-settings-store";
import type { WaiterSalesSettingsInput } from "@/lib/sales/waiter-sales-settings-types";
import {
  canEditDailyVsWaiters,
  canEditDiscounts,
  canEditVenueDaily,
  canEditWaiterDaily,
  canManageSalesWaiters,
} from "@/lib/sales/permissions";
import { SALES_MODULE_KEY } from "@/lib/sales/types";
import { createClient } from "@/lib/supabase/server";

const SALES_WAITERS_PATHS = [
  "/sales/settings/waiters",
  "/sales/settings/tenders",
  "/sales/settings/groups-charge",
  "/sales/waiter/entry",
  "/sales/waiter/data",
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
];

function revalidateSalesDiscounts() {
  for (const path of SALES_DISCOUNTS_PATHS) {
    revalidatePath(path);
  }
}

const SALES_DAILY_PATHS = [
  "/sales/daily",
  "/sales/daily/data",
  "/sales/daily/entry",
  "/sales/settings",
  "/sales/settings/tax",
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

async function getSalesAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const venueSlug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!venueSlug) redirect("/select-venue");

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", venueSlug)
    .single();
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
      dinner_food_gs: parseMoney(formData.get("dinner_food_gs")),
      dinner_beverages_gs: parseMoney(formData.get("dinner_beverages_gs")),
      dinner_wine_gs: parseMoney(formData.get("dinner_wine_gs")),
      dinner_shisha_gs: parseMoney(formData.get("dinner_shisha_gs")),
      dinner_tobacco_gs: parseMoney(formData.get("dinner_tobacco_gs")),
      dinner_others_gs: parseMoney(formData.get("dinner_others_gs")),
      dinner_service_fees_gs: parseMoney(formData.get("dinner_service_fees_gs")),
      dinner_covers: parseCount(formData.get("dinner_covers")),
      dinner_bookings: parseCount(formData.get("dinner_bookings")),
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

  try {
    const record = await upsertVenueDailyDiscounts(supabase, venue.id, user.id, {
      id,
      sale_date: saleDate,
      lunch_food_discount_gs: parseMoney(formData.get("lunch_food_discount_gs")),
      lunch_beverages_discount_gs: parseMoney(
        formData.get("lunch_beverages_discount_gs"),
      ),
      lunch_wine_discount_gs: parseMoney(formData.get("lunch_wine_discount_gs")),
      lunch_shisha_discount_gs: parseMoney(
        formData.get("lunch_shisha_discount_gs"),
      ),
      lunch_others_discount_gs: parseMoney(
        formData.get("lunch_others_discount_gs"),
      ),
      dinner_food_discount_gs: parseMoney(
        formData.get("dinner_food_discount_gs"),
      ),
      dinner_beverages_discount_gs: parseMoney(
        formData.get("dinner_beverages_discount_gs"),
      ),
      dinner_wine_discount_gs: parseMoney(
        formData.get("dinner_wine_discount_gs"),
      ),
      dinner_shisha_discount_gs: parseMoney(
        formData.get("dinner_shisha_discount_gs"),
      ),
      dinner_others_discount_gs: parseMoney(
        formData.get("dinner_others_discount_gs"),
      ),
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

  try {
    const waiter = await upsertVenueWaiter(supabase, venue.id, user.id, {
      id,
      name,
      position,
      status,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_waiters",
      entity_id: waiter.id,
      venue_id: venue.id,
      after: { name, position, status },
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

  try {
    const tender = await upsertVenueTender(supabase, venue.id, user.id, {
      id,
      name,
      status,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });

    await writeAuditLog({
      actor_id: user.id,
      action: id ? "update" : "create",
      module_key: SALES_MODULE_KEY,
      entity: "venue_tenders",
      entity_id: tender.id,
      venue_id: venue.id,
      after: { name, status },
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