"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { createServiceClient } from "@/lib/supabase/service";
import { canAdminAccountingSettings } from "@/lib/accounting/permissions";
import type {
  AccDimensionStatus,
  AccEmirate,
  AccSequenceReset,
  AccVatFilingFrequency,
} from "@/lib/accounting/types";

function fail(message: string) {
  return { ok: false as const, error: message };
}

async function requireSettingsAdmin(): Promise<
  | { error: string }
  | { userId: string; venueId: string; service: ReturnType<typeof createServiceClient> }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };

  if (!canAdminAccountingSettings(auth.permissions, auth.venue.id)) {
    return { error: "You need Accounting Settings admin access." };
  }

  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

function revalidateAccountingSettings() {
  // Page-scoped only — avoid revalidating the app shell (notification center).
  revalidatePath("/accounting/settings", "page");
  revalidatePath("/accounting/settings/coa", "page");
  revalidatePath("/accounting/settings/dimensions", "page");
  revalidatePath("/accounting/settings/defaults", "page");
  revalidatePath("/accounting/settings/sequences", "page");
}

export async function upsertLegalEntity(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const id = String(formData.get("id") ?? "").trim() || null;
  const entity_code = String(formData.get("entity_code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const trnRaw = String(formData.get("trn") ?? "").trim();
  const trn = trnRaw === "" ? null : trnRaw;
  const trade_licence_no =
    String(formData.get("trade_licence_no") ?? "").trim() || null;
  const licensing_authority =
    String(formData.get("licensing_authority") ?? "").trim() || null;
  const emirate = String(formData.get("emirate") ?? "dubai") as AccEmirate;
  const vat_filing_frequency = String(
    formData.get("vat_filing_frequency") ?? "monthly",
  ) as AccVatFilingFrequency;
  const first_open_period = String(formData.get("first_open_period") ?? "").trim();
  const fiscal_year_start_month = Number(
    formData.get("fiscal_year_start_month") ?? 1,
  );

  if (!entity_code || !name || !first_open_period) {
    return fail("Entity code, name, and first open period are required.");
  }
  if (trn && !/^\d{15}$/.test(trn)) {
    return fail("TRN must be exactly 15 digits (or left blank).");
  }
  if (fiscal_year_start_month < 1 || fiscal_year_start_month > 12) {
    return fail("Fiscal year start month must be 1–12.");
  }

  const payload = {
    entity_code,
    name,
    trn,
    trade_licence_no,
    licensing_authority,
    emirate,
    functional_currency: "AED",
    vat_filing_frequency,
    first_open_period,
    fiscal_year_start_month,
    updated_at: new Date().toISOString(),
  };

  let before: Record<string, unknown> | null = null;
  if (id) {
    const { data } = await ctx.service
      .from("legal_entities")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    before = data as Record<string, unknown> | null;
  }

  const query = id
    ? ctx.service.from("legal_entities").update(payload).eq("id", id).select("*").single()
    : ctx.service.from("legal_entities").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: id ? "update" : "create",
    module_key: "accounting",
    entity: "legal_entities",
    entity_id: String(data.id),
    venue_id: ctx.venueId,
    before,
    after: data as Record<string, unknown>,
  });

  // Keep legal_entity dimension value in sync
  const { data: dim } = await ctx.service
    .from("dimensions")
    .select("id")
    .eq("key", "legal_entity")
    .maybeSingle();
  if (dim?.id) {
    await ctx.service.from("dimension_values").upsert(
      {
        dimension_id: dim.id,
        value_code: entity_code,
        label: name,
        meta: { entity_id: data.id },
        active: true,
      },
      { onConflict: "dimension_id,value_code" },
    );
  }

  revalidateAccountingSettings();
  return { ok: true as const, id: String(data.id) };
}

export async function upsertVenueEntity(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const id = String(formData.get("id") ?? "").trim() || null;
  const venue_id = String(formData.get("venue_id") ?? "").trim();
  const entity_id = String(formData.get("entity_id") ?? "").trim();
  const emirate_of_supply = String(
    formData.get("emirate_of_supply") ?? "dubai",
  ) as AccEmirate;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!venue_id || !entity_id) {
    return fail("Venue and legal entity are required.");
  }

  const payload = {
    venue_id,
    entity_id,
    emirate_of_supply,
    notes,
    updated_at: new Date().toISOString(),
  };

  let before: Record<string, unknown> | null = null;
  if (id) {
    const { data } = await ctx.service
      .from("venue_entities")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    before = data as Record<string, unknown> | null;
  }

  const query = id
    ? ctx.service.from("venue_entities").update(payload).eq("id", id).select("*").single()
    : ctx.service.from("venue_entities").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: id ? "update" : "create",
    module_key: "accounting",
    entity: "venue_entities",
    entity_id: String(data.id),
    venue_id,
    before,
    after: data as Record<string, unknown>,
  });

  revalidateAccountingSettings();
  return { ok: true as const };
}

export async function updateAccount(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const active = String(formData.get("active") ?? "true") === "true";

  if (!id || !name) return fail("Account id and name are required.");

  const { data: before } = await ctx.service
    .from("accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await ctx.service
    .from("accounts")
    .update({ name, active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "accounting",
    entity: "accounts",
    entity_id: id,
    venue_id: ctx.venueId,
    before: before as Record<string, unknown> | null,
    after: data as Record<string, unknown>,
  });

  revalidateAccountingSettings();
  return { ok: true as const };
}

export async function updateDimensionStatus(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "") as AccDimensionStatus;
  if (!id || !["off", "optional", "required"].includes(status)) {
    return fail("Valid dimension id and status are required.");
  }

  const { data: before } = await ctx.service
    .from("dimensions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await ctx.service
    .from("dimensions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "accounting",
    entity: "dimensions",
    entity_id: id,
    venue_id: ctx.venueId,
    before: before as Record<string, unknown> | null,
    after: data as Record<string, unknown>,
  });

  revalidateAccountingSettings();
  return { ok: true as const };
}

export async function updateSystemDefaultAccount(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const key = String(formData.get("key") ?? "").trim();
  const account_id = String(formData.get("account_id") ?? "").trim();
  if (!key || !account_id) return fail("Key and account are required.");

  const { data: account } = await ctx.service
    .from("accounts")
    .select("id, is_postable, node_type")
    .eq("id", account_id)
    .maybeSingle();

  if (!account) return fail("Account not found.");
  if (key !== "current_year_pl" && !account.is_postable) {
    return fail("Default posting targets must be postable ledger accounts.");
  }

  const { data: before } = await ctx.service
    .from("system_default_accounts")
    .select("*")
    .eq("key", key)
    .maybeSingle();

  const { data, error } = await ctx.service
    .from("system_default_accounts")
    .update({ account_id, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select("*")
    .single();

  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "accounting",
    entity: "system_default_accounts",
    entity_id: key,
    venue_id: ctx.venueId,
    before: before as Record<string, unknown> | null,
    after: data as Record<string, unknown>,
  });

  revalidateAccountingSettings();
  return { ok: true as const };
}

export async function updateSequence(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const id = String(formData.get("id") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim();
  const padding = Number(formData.get("padding") ?? 6);
  const reset_rule = String(formData.get("reset_rule") ?? "yearly") as AccSequenceReset;

  if (!id || !prefix) return fail("Sequence id and prefix are required.");
  if (padding < 1 || padding > 12) return fail("Padding must be 1–12.");
  if (!["never", "yearly", "monthly"].includes(reset_rule)) {
    return fail("Invalid reset rule.");
  }

  const { data: before } = await ctx.service
    .from("sequences")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await ctx.service
    .from("sequences")
    .update({
      prefix,
      padding,
      reset_rule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "accounting",
    entity: "sequences",
    entity_id: id,
    venue_id: ctx.venueId,
    before: before as Record<string, unknown> | null,
    after: data as Record<string, unknown>,
  });

  revalidateAccountingSettings();
  return { ok: true as const };
}
