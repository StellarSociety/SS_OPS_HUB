"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  finalizeBenefitAllocations,
  reopenBenefitAllocations,
  mergeGratuitySettings,
  normalizePointTierPositionIds,
  mergeServiceChargeSettings,
  persistCalculatedBenefitRun,
  resolveGratuityPeriod,
  resolveServiceChargePeriod,
  benefitMonthToDate,
  isBenefitRunLocked,
  readStaffOverridesFromSnapshot,
  withStaffOverridesOnSnapshot,
  type BenefitKind,
  type BenefitStaffOverride,
  type CreateBenefitDeductionInput,
  type HrGratuitySettings,
  type HrServiceChargeSettings,
} from "@/lib/hr/benefits";
import {
  canAccessBenefits,
  canAdminLookups,
  canEditBenefits,
} from "@/lib/hr/permissions";
import { mergeLeavePolicy } from "@/lib/hr/leave";
import {
  mergePayrollSettings,
  payFractionForLabel,
  type PayrollDayFraction,
} from "@/lib/hr/payroll";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrLeavePolicySettings,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type BenefitActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function getBenefitsAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) {
    return { error: ctx.error } as const;
  }
  return ctx;
}

function revalidateBenefits(kind?: BenefitKind, runId?: string) {
  revalidatePath("/hr/benefits", "layout");
  revalidatePath("/hr/benefits/gratuity", "page");
  revalidatePath("/hr/benefits/collections", "page");
  revalidatePath("/hr/benefits/service-charge", "page");
  revalidatePath("/hr/benefits/deductions", "page");
  revalidatePath("/hr/settings/pay/benefits", "layout");
  revalidatePath("/hr/settings/pay/benefits/gratuity", "page");
  revalidatePath("/hr/settings/pay/benefits/service-charge", "page");
  if (kind === "gratuity") {
    revalidatePath("/hr/benefits/gratuity", "page");
    if (runId) revalidatePath(`/hr/benefits/gratuity/${runId}`, "page");
  }
  if (kind === "service_charge") {
    revalidatePath("/hr/benefits/service-charge", "page");
    if (runId) revalidatePath(`/hr/benefits/service-charge/${runId}`, "page");
  }
}

function parseCheckbox(formData: FormData, key: string): boolean {
  const v = String(formData.get(key) ?? "");
  return v === "on" || v === "true" || v === "1";
}

function num(formData: FormData, key: string, fallback: number): number {
  const v = Number(formData.get(key));
  return Number.isFinite(v) ? v : fallback;
}

function parseDepartmentShares(formData: FormData) {
  const raw = String(formData.get("department_shares_json") ?? "").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        key: String(r.key ?? ""),
        label: String(r.label ?? ""),
        percent: Number(r.percent) || 0,
      };
    });
  } catch {
    return undefined;
  }
}

function parsePointTiers(formData: FormData) {
  const raw = String(formData.get("point_tiers_json") ?? "").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const tiers = parsed.map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        key: String(r.key ?? ""),
        label: String(r.label ?? ""),
        points: Number(r.points) || 0,
        positionIds: Array.isArray(r.positionIds)
          ? r.positionIds.map((id) => String(id)).filter(Boolean)
          : Array.isArray(r.position_ids)
            ? r.position_ids.map((id) => String(id)).filter(Boolean)
            : [],
      };
    });
    return normalizePointTierPositionIds(tiers);
  } catch {
    return undefined;
  }
}

function parseDisciplinary(formData: FormData) {
  const raw = String(formData.get("disciplinary_json") ?? "").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        level: String(r.level ?? "verbal") as
          | "verbal"
          | "first_written"
          | "second_written"
          | "final",
        label: String(r.label ?? ""),
        percent: Number(r.percent) || 0,
      };
    });
  } catch {
    return undefined;
  }
}

export async function createBenefitRun(
  kind: BenefitKind,
  benefitMonth: string,
): Promise<{ id: string } | { error: string }> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { error: "You do not have permission to create benefit runs." };
  }

  try {
    const service = createServiceClient();
    const payrollSettingsRaw = await getHrVenueSetting(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.payroll,
      {},
    );
    const payrollSettings = mergePayrollSettings(payrollSettingsRaw);

    let period;
    let settingsSnapshot: HrGratuitySettings | HrServiceChargeSettings;

    if (kind === "gratuity") {
      const stored = await getHrVenueSetting<Partial<HrGratuitySettings>>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.benefitsGratuity,
        {},
      );
      const gratuitySettings = mergeGratuitySettings(stored);
      settingsSnapshot = gratuitySettings;
      period = resolveGratuityPeriod(
        benefitMonth,
        gratuitySettings,
        payrollSettings,
      );
    } else {
      const stored = await getHrVenueSetting<Partial<HrServiceChargeSettings>>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.benefitsServiceCharge,
        {},
      );
      const serviceChargeSettings = mergeServiceChargeSettings(stored);
      settingsSnapshot = serviceChargeSettings;
      period = resolveServiceChargePeriod(
        benefitMonth,
        serviceChargeSettings,
        payrollSettings,
      );
    }

    const { data: run, error } = await service
      .from("hr_benefit_runs")
      .insert({
        venue_id: venue.id,
        benefit_kind: kind,
        benefit_month: period.benefitMonth,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        distribution_date: period.distributionDate,
        status: "draft",
        totals: {},
        settings_snapshot: settingsSnapshot,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          error: `A ${kind === "gratuity" ? "gratuity" : "service charge"} run already exists for that month.`,
        };
      }
      return { error: error.message };
    }

    await service.from("hr_benefit_run_events").insert({
      venue_id: venue.id,
      run_id: run.id,
      actor_id: user.id,
      from_status: null,
      to_status: "draft",
      comment: `${kind === "gratuity" ? "Gratuity" : "Service charge"} run created`,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.run_created",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: run.id,
      after: { kind, benefitMonth: period.benefitMonth },
    });

    try {
      await persistCalculatedBenefitRun({
        service,
        venueId: venue.id,
        runId: run.id,
        kind,
        userId: user.id,
      });
    } catch (calcErr) {
      console.error(
        "[benefits] auto-calculate after create:",
        calcErr instanceof Error ? calcErr.message : calcErr,
      );
    }

    revalidateBenefits(kind, run.id);
    return { id: run.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create run";
    if (/hr_benefit_runs|schema cache|does not exist/i.test(message)) {
      return {
        error:
          "Benefits tables are not migrated yet. Apply supabase/migrations/20260728040000_hr_benefit_runs.sql then retry.",
      };
    }
    return { error: message };
  }
}

export async function saveHrGratuitySettings(
  formData: FormData,
): Promise<void> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) throw new Error(auth.error);
  const { user, venue, permissions } = auth;

  if (
    !canAdminLookups(permissions, venue.id) &&
    !canEditBenefits(permissions, venue.id)
  ) {
    throw new Error("No permission to save gratuity settings.");
  }

  const tipOutModeRaw = String(formData.get("waiter_cc_tip_out_mode") ?? "");
  const tipOutMode =
    tipOutModeRaw === "asph_kpi" || tipOutModeRaw === "collection_percent"
      ? tipOutModeRaw
      : "collection_percent";

  const periodModeRaw = String(formData.get("period_mode") ?? "");
  const periodMode =
    periodModeRaw === "payroll_period" || periodModeRaw === "calendar_month"
      ? periodModeRaw
      : "calendar_month";

  const value = mergeGratuitySettings({
    periodMode,
    periodStartDay: num(formData, "period_start_day", 1),
    periodEndDay: num(formData, "period_end_day", 31),
    distributionDayOfMonth: num(formData, "distribution_day_of_month", 15),
    distributionMonthOffset: num(formData, "distribution_month_offset", 1),
    waiterCashRetainPercent: num(formData, "waiter_cash_retain_percent", 70),
    waiterCashPoolPercent: num(formData, "waiter_cash_pool_percent", 30),
    waiterCcTipOutMode: tipOutMode,
    waiterCcCollectionTipOutPercent: num(
      formData,
      "waiter_cc_collection_tip_out_percent",
      30,
    ),
    waiterCcTipOutPctWhenKpiMet: num(
      formData,
      "waiter_cc_tip_out_pct_when_kpi_met",
      1.5,
    ),
    waiterCcTipOutPctWhenKpiMissed: num(
      formData,
      "waiter_cc_tip_out_pct_when_kpi_missed",
      2,
    ),
    asphKpiEnabled: parseCheckbox(formData, "asph_kpi_enabled"),
    runnerHousekeeperDeductPercent: num(
      formData,
      "runner_housekeeper_deduct_percent",
      3,
    ),
    poolOseDeductPercent: num(formData, "pool_ose_deduct_percent", 2),
    poolStaffActivitiesDeductPercent: num(
      formData,
      "pool_staff_activities_deduct_percent",
      1,
    ),
    departmentShares: parseDepartmentShares(formData),
    pointTiers: parsePointTiers(formData),
    disciplinaryDeductions: parseDisciplinary(formData),
    includeRegularDaysOffInWorkedDays: true,
    includePublicHolidaysInWorkedDays: false,
    excludeLeaveFromWorkedDays: true,
    barCashEqualSplit: parseCheckbox(formData, "bar_cash_equal_split"),
    barCcPoolPercent: num(formData, "bar_cc_pool_percent", 50),
    barCcBarStaffPercent: num(formData, "bar_cc_bar_staff_percent", 50),
    resignationEntitled: parseCheckbox(formData, "resignation_entitled"),
    terminationEntitled: parseCheckbox(formData, "termination_entitled"),
    notes: String(formData.get("notes") ?? "").trim(),
  });

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.benefitsGratuity,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "benefits.gratuity_settings_saved",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: venue.id,
  });

  revalidateBenefits("gratuity");
}

export async function saveHrServiceChargeSettings(
  formData: FormData,
): Promise<void> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) throw new Error(auth.error);
  const { user, venue, permissions } = auth;

  if (
    !canAdminLookups(permissions, venue.id) &&
    !canEditBenefits(permissions, venue.id)
  ) {
    throw new Error("No permission to save service charge settings.");
  }

  const periodModeRaw = String(formData.get("period_mode") ?? "");
  const periodMode =
    periodModeRaw === "payroll_period" || periodModeRaw === "calendar_month"
      ? periodModeRaw
      : "calendar_month";

  const value = mergeServiceChargeSettings({
    periodMode,
    periodStartDay: num(formData, "period_start_day", 1),
    periodEndDay: num(formData, "period_end_day", 31),
    distributionDayOfMonth: num(formData, "distribution_day_of_month", 15),
    distributionMonthOffset: num(formData, "distribution_month_offset", 1),
    staffDistributablePercent: num(formData, "staff_distributable_percent", 50),
    pointTiers: parsePointTiers(formData),
    disciplinaryDeductions: parseDisciplinary(formData),
    includeRegularDaysOffInWorkedDays: true,
    includePublicHolidaysInWorkedDays: false,
    excludeLeaveFromWorkedDays: true,
    resignationEntitled: parseCheckbox(formData, "resignation_entitled"),
    terminationEntitled: parseCheckbox(formData, "termination_entitled"),
    notes: String(formData.get("notes") ?? "").trim(),
  });

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.benefitsServiceCharge,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "benefits.service_charge_settings_saved",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: venue.id,
  });

  revalidateBenefits("service_charge");
}

export async function listBenefitRunsAction(
  kind: BenefitKind,
): Promise<unknown[]> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return [];
  const { supabase, venue, permissions } = auth;
  if (!canAccessBenefits(permissions, venue.id)) return [];

  const { data, error } = await supabase
    .from("hr_benefit_runs")
    .select(
      "id, benefit_kind, benefit_month, period_start, period_end, distribution_date, status, totals, created_at",
    )
    .eq("venue_id", venue.id)
    .eq("benefit_kind", kind)
    .order("benefit_month", { ascending: false });

  if (error) {
    console.error("[benefits] list runs:", error.message);
    return [];
  }
  return data ?? [];
}

export async function recalculateBenefitRun(
  kind: BenefitKind,
  runId: string,
): Promise<BenefitActionResult & { warnings?: string[] }> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to recalculate benefit runs." };
  }

  try {
    const service = createServiceClient();
    const { data: existingRun } = await service
      .from("hr_benefit_runs")
      .select("id, status")
      .eq("id", runId)
      .eq("venue_id", venue.id)
      .maybeSingle();
    if (!existingRun) return { ok: false, error: "Benefit run not found." };
    if (isBenefitRunLocked(String(existingRun.status))) {
      return {
        ok: false,
        error: `Cannot recalculate a run in status "${existingRun.status}". Reopen it first to apply alterations.`,
      };
    }

    // Refresh settings snapshot from current venue settings before calc,
    // preserving per-staff tip-point / disciplinary overrides on the run.
    if (kind === "gratuity") {
      const { data: existingRun } = await service
        .from("hr_benefit_runs")
        .select("settings_snapshot")
        .eq("id", runId)
        .eq("venue_id", venue.id)
        .maybeSingle();
      const preserved = readStaffOverridesFromSnapshot(
        existingRun?.settings_snapshot,
      );
      const existingSnap =
        (existingRun?.settings_snapshot as Record<string, unknown> | null) ??
        {};
      const stored = await getHrVenueSetting<Partial<HrGratuitySettings>>(
        auth.supabase,
        venue.id,
        HR_SETTINGS_KEYS.benefitsGratuity,
        {},
      );
      const nextSnapshot = withStaffOverridesOnSnapshot(
        mergeGratuitySettings(stored) as unknown as Record<string, unknown>,
        preserved,
      ) as Record<string, unknown>;
      if ("asphKpiThreshold" in existingSnap) {
        nextSnapshot.asphKpiThreshold = existingSnap.asphKpiThreshold;
      }
      if ("forecastAsphKpiThreshold" in existingSnap) {
        nextSnapshot.forecastAsphKpiThreshold =
          existingSnap.forecastAsphKpiThreshold;
      }
      if ("departmentAllocationMode" in existingSnap) {
        nextSnapshot.departmentAllocationMode =
          existingSnap.departmentAllocationMode;
      }
      await service
        .from("hr_benefit_runs")
        .update({
          settings_snapshot: nextSnapshot,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("venue_id", venue.id);
    } else {
      const { data: existingRun } = await service
        .from("hr_benefit_runs")
        .select("settings_snapshot")
        .eq("id", runId)
        .eq("venue_id", venue.id)
        .maybeSingle();
      const preserved = readStaffOverridesFromSnapshot(
        existingRun?.settings_snapshot,
      );
      const stored = await getHrVenueSetting<Partial<HrServiceChargeSettings>>(
        auth.supabase,
        venue.id,
        HR_SETTINGS_KEYS.benefitsServiceCharge,
        {},
      );
      await service
        .from("hr_benefit_runs")
        .update({
          settings_snapshot: withStaffOverridesOnSnapshot(
            mergeServiceChargeSettings(stored) as unknown as Record<
              string,
              unknown
            >,
            preserved,
          ),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("venue_id", venue.id);
    }

    const { warnings } = await persistCalculatedBenefitRun({
      service,
      venueId: venue.id,
      runId,
      kind,
      userId: user.id,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.run_recalculated",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: { kind, warningCount: warnings.length },
    });

    revalidateBenefits(kind, runId);
    return { ok: true, id: runId, warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recalculate failed";
    if (/hr_benefit_runs|schema cache|does not exist/i.test(message)) {
      return {
        ok: false,
        error:
          "Benefits tables are not migrated yet. Apply supabase/migrations/20260728040000_hr_benefit_runs.sql then retry.",
      };
    }
    return { ok: false, error: message };
  }
}

export async function finalizeBenefitRun(
  kind: BenefitKind,
  runId: string,
): Promise<BenefitActionResult> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to finalize benefit runs." };
  }

  try {
    const service = createServiceClient();
    await finalizeBenefitAllocations({
      service,
      venueId: venue.id,
      runId,
      userId: user.id,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.run_finalized",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: { kind },
    });

    revalidateBenefits(kind, runId);
    revalidatePath("/hr/payroll", "page");
    return { ok: true, id: runId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Finalize failed",
    };
  }
}

export async function reopenBenefitRun(
  kind: BenefitKind,
  runId: string,
): Promise<BenefitActionResult> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to reopen benefit runs." };
  }

  try {
    const service = createServiceClient();
    const { previousStatus } = await reopenBenefitAllocations({
      service,
      venueId: venue.id,
      runId,
      userId: user.id,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.run_reopened",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: { kind, previousStatus },
    });

    revalidateBenefits(kind, runId);
    revalidatePath("/hr/payroll", "page");
    return { ok: true, id: runId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Reopen failed",
    };
  }
}

export async function updateBenefitStaffOverride(
  kind: BenefitKind,
  runId: string,
  staffId: string,
  patch: BenefitStaffOverride,
): Promise<BenefitActionResult & { warnings?: string[] }> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit benefit allocations." };
  }

  try {
    const service = createServiceClient();
    const { data: run, error } = await service
      .from("hr_benefit_runs")
      .select("id, status, settings_snapshot, benefit_kind")
      .eq("id", runId)
      .eq("venue_id", venue.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) return { ok: false, error: "Benefit run not found." };
    if (run.benefit_kind !== kind) {
      return { ok: false, error: "Benefit run kind mismatch." };
    }
    if (isBenefitRunLocked(String(run.status))) {
      return {
        ok: false,
        error: `Cannot edit allocations on a run in status "${run.status}".`,
      };
    }

    const overrides = readStaffOverridesFromSnapshot(run.settings_snapshot);
    const prev = overrides[staffId] ?? {};
    const next: BenefitStaffOverride = { ...prev };

    if ("tipPoints" in patch) {
      if (patch.tipPoints == null || Number.isNaN(Number(patch.tipPoints))) {
        next.tipPoints = null;
      } else {
        next.tipPoints = Math.max(0, Number(patch.tipPoints));
      }
    }
    if ("warningLevel" in patch) {
      next.warningLevel = patch.warningLevel ?? null;
    }
    if ("excluded" in patch) {
      next.excluded = patch.excluded === true;
    }

    if (
      next.tipPoints == null &&
      next.warningLevel == null &&
      !next.excluded
    ) {
      delete overrides[staffId];
    } else {
      overrides[staffId] = next;
    }

    const baseSnapshot =
      (run.settings_snapshot as Record<string, unknown> | null) ?? {};
    const { error: updateError } = await service
      .from("hr_benefit_runs")
      .update({
        settings_snapshot: withStaffOverridesOnSnapshot(
          baseSnapshot,
          overrides,
        ),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("venue_id", venue.id);

    if (updateError) throw new Error(updateError.message);

    const { warnings } = await persistCalculatedBenefitRun({
      service,
      venueId: venue.id,
      runId,
      kind,
      userId: user.id,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.staff_override_updated",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: { kind, staffId, patch: next },
    });

    revalidateBenefits(kind, runId);
    return { ok: true, id: runId, warnings };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update allocation",
    };
  }
}

export async function updateBenefitRunDepartmentShares(
  kind: BenefitKind,
  runId: string,
  shares: Array<{ key: string; percent: number }>,
  deductions?: {
    osePercent?: number;
    activitiesPercent?: number;
    runnerHousekeeperPercent?: number;
  } | null,
  allocationMode?:
    | "fixed_percent"
    | "equal_point_value"
    | "bypass_department"
    | null,
): Promise<BenefitActionResult & { warnings?: string[] }> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit department shares." };
  }

  try {
    const service = createServiceClient();
    const { data: run, error } = await service
      .from("hr_benefit_runs")
      .select("id, status, settings_snapshot, benefit_kind")
      .eq("id", runId)
      .eq("venue_id", venue.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) return { ok: false, error: "Benefit run not found." };
    if (run.benefit_kind !== kind) {
      return { ok: false, error: "Benefit run kind mismatch." };
    }
    if (isBenefitRunLocked(String(run.status))) {
      return {
        ok: false,
        error: `Cannot edit department shares on a run in status "${run.status}".`,
      };
    }

    const percentByKey = new Map(
      shares.map((s) => [s.key, Math.max(0, Number(s.percent) || 0)]),
    );

    const baseSnapshot =
      (run.settings_snapshot as Record<string, unknown> | null) ?? {};
    const existingShares = Array.isArray(baseSnapshot.departmentShares)
      ? (baseSnapshot.departmentShares as Array<Record<string, unknown>>)
      : [];

    const nextShares = existingShares.map((row) => {
      const key = String(row.key ?? "");
      if (!percentByKey.has(key)) return row;
      return { ...row, percent: percentByKey.get(key) };
    });

    const nextSnapshot: Record<string, unknown> = {
      ...baseSnapshot,
      departmentShares: nextShares,
    };

    if (deductions) {
      if (deductions.osePercent != null) {
        nextSnapshot.poolOseDeductPercent = Math.max(
          0,
          Number(deductions.osePercent) || 0,
        );
      }
      if (deductions.activitiesPercent != null) {
        nextSnapshot.poolStaffActivitiesDeductPercent = Math.max(
          0,
          Number(deductions.activitiesPercent) || 0,
        );
      }
      if (deductions.runnerHousekeeperPercent != null) {
        nextSnapshot.runnerHousekeeperDeductPercent = Math.max(
          0,
          Number(deductions.runnerHousekeeperPercent) || 0,
        );
      }
    }

    if (
      allocationMode === "equal_point_value" ||
      allocationMode === "fixed_percent" ||
      allocationMode === "bypass_department"
    ) {
      nextSnapshot.departmentAllocationMode = allocationMode;
    }

    const { error: updateError } = await service
      .from("hr_benefit_runs")
      .update({
        settings_snapshot: nextSnapshot,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("venue_id", venue.id);

    if (updateError) throw new Error(updateError.message);

    const { warnings } = await persistCalculatedBenefitRun({
      service,
      venueId: venue.id,
      runId,
      kind,
      userId: user.id,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.department_shares_updated",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: {
        kind,
        shares,
        deductions: deductions ?? null,
        allocationMode: allocationMode ?? null,
      },
    });

    revalidateBenefits(kind, runId);
    return { ok: true, id: runId, warnings };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not update department shares",
    };
  }
}

/** Override the month ASPH KPI threshold used for waiter tip-out on this run. */
export async function updateBenefitRunAsphKpiThreshold(
  runId: string,
  threshold: number | null,
): Promise<BenefitActionResult & { warnings?: string[] }> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit ASPH threshold." };
  }

  try {
    const service = createServiceClient();
    const { data: run, error } = await service
      .from("hr_benefit_runs")
      .select("id, status, settings_snapshot, benefit_kind")
      .eq("id", runId)
      .eq("venue_id", venue.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) return { ok: false, error: "Benefit run not found." };
    if (run.benefit_kind !== "gratuity") {
      return { ok: false, error: "ASPH threshold applies to gratuity runs only." };
    }
    if (isBenefitRunLocked(String(run.status))) {
      return {
        ok: false,
        error: `Cannot edit ASPH threshold on a run in status "${run.status}".`,
      };
    }

    const nextValue =
      threshold == null || !Number.isFinite(threshold)
        ? null
        : Math.max(0, Number(threshold));

    const baseSnapshot =
      (run.settings_snapshot as Record<string, unknown> | null) ?? {};
    const nextSnapshot: Record<string, unknown> = {
      ...baseSnapshot,
      asphKpiThreshold: nextValue,
    };

    await service
      .from("hr_benefit_runs")
      .update({
        settings_snapshot: nextSnapshot,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("venue_id", venue.id);

    const { warnings } = await persistCalculatedBenefitRun({
      service,
      venueId: venue.id,
      runId,
      kind: "gratuity",
      userId: user.id,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.asph_kpi_threshold_updated",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: { asphKpiThreshold: nextValue },
    });

    revalidateBenefits("gratuity", runId);
    return { ok: true, id: runId, warnings };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not update ASPH threshold",
    };
  }
}

export type WithheldRetainDisposition = "collections" | "waive" | "pool";

/** This run only: choose where withheld retain goes. */
export async function updateBenefitRunWithheldRetainDisposition(
  runId: string,
  disposition: WithheldRetainDisposition,
): Promise<BenefitActionResult & { warnings?: string[] }> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit this benefit run." };
  }

  if (
    disposition !== "collections" &&
    disposition !== "waive" &&
    disposition !== "pool"
  ) {
    return { ok: false, error: "Invalid withheld retain destination." };
  }

  try {
    const service = createServiceClient();
    const { data: run, error } = await service
      .from("hr_benefit_runs")
      .select("id, status, settings_snapshot, benefit_kind")
      .eq("id", runId)
      .eq("venue_id", venue.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) return { ok: false, error: "Benefit run not found." };
    if (run.benefit_kind !== "gratuity") {
      return {
        ok: false,
        error: "Withheld retain options apply to gratuity runs only.",
      };
    }
    if (isBenefitRunLocked(String(run.status))) {
      return {
        ok: false,
        error: `Cannot change withheld retain on a run in status "${run.status}".`,
      };
    }

    const baseSnapshot =
      (run.settings_snapshot as Record<string, unknown> | null) ?? {};
    const nextSnapshot: Record<string, unknown> = {
      ...baseSnapshot,
      waiveWithheldRetain: disposition === "waive",
      withheldRetainToPool: disposition === "pool",
    };

    await service
      .from("hr_benefit_runs")
      .update({
        settings_snapshot: nextSnapshot,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("venue_id", venue.id);

    const { warnings } = await persistCalculatedBenefitRun({
      service,
      venueId: venue.id,
      runId,
      kind: "gratuity",
      userId: user.id,
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.withheld_retain_disposition_updated",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: {
        withheldRetainDisposition: disposition,
        waiveWithheldRetain: disposition === "waive",
        withheldRetainToPool: disposition === "pool",
      },
    });

    revalidateBenefits("gratuity", runId);
    return { ok: true, id: runId, warnings };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Could not update withheld retain destination",
    };
  }
}

/**
 * Persist current run settings (department shares / deductions / allocation mode)
 * and leave the run in draft for later finalization. Does not reload venue policy.
 */
export async function saveBenefitRunDraft(
  kind: BenefitKind,
  runId: string,
  options?: {
    shares?: Array<{ key: string; percent: number }>;
    deductions?: {
      osePercent?: number;
      activitiesPercent?: number;
      runnerHousekeeperPercent?: number;
    } | null;
    allocationMode?:
      | "fixed_percent"
      | "equal_point_value"
      | "bypass_department"
      | null;
  },
): Promise<BenefitActionResult & { warnings?: string[] }> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to save benefit runs." };
  }

  try {
    const service = createServiceClient();
    const { data: run, error } = await service
      .from("hr_benefit_runs")
      .select("id, status, settings_snapshot, benefit_kind")
      .eq("id", runId)
      .eq("venue_id", venue.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) return { ok: false, error: "Benefit run not found." };
    if (run.benefit_kind !== kind) {
      return { ok: false, error: "Benefit run kind mismatch." };
    }
    if (isBenefitRunLocked(String(run.status))) {
      return {
        ok: false,
        error: `Cannot save a run in status "${run.status}".`,
      };
    }

    const baseSnapshot =
      (run.settings_snapshot as Record<string, unknown> | null) ?? {};
    const nextSnapshot: Record<string, unknown> = { ...baseSnapshot };

    if (options?.shares?.length) {
      const percentByKey = new Map(
        options.shares.map((s) => [
          s.key,
          Math.max(0, Number(s.percent) || 0),
        ]),
      );
      const existingShares = Array.isArray(baseSnapshot.departmentShares)
        ? (baseSnapshot.departmentShares as Array<Record<string, unknown>>)
        : [];
      nextSnapshot.departmentShares = existingShares.map((row) => {
        const key = String(row.key ?? "");
        if (!percentByKey.has(key)) return row;
        return { ...row, percent: percentByKey.get(key) };
      });
    }

    const deductions = options?.deductions;
    if (deductions) {
      if (deductions.osePercent != null) {
        nextSnapshot.poolOseDeductPercent = Math.max(
          0,
          Number(deductions.osePercent) || 0,
        );
      }
      if (deductions.activitiesPercent != null) {
        nextSnapshot.poolStaffActivitiesDeductPercent = Math.max(
          0,
          Number(deductions.activitiesPercent) || 0,
        );
      }
      if (deductions.runnerHousekeeperPercent != null) {
        nextSnapshot.runnerHousekeeperDeductPercent = Math.max(
          0,
          Number(deductions.runnerHousekeeperPercent) || 0,
        );
      }
    }

    if (
      options?.allocationMode === "equal_point_value" ||
      options?.allocationMode === "fixed_percent" ||
      options?.allocationMode === "bypass_department"
    ) {
      nextSnapshot.departmentAllocationMode = options.allocationMode;
    }

    const { error: updateError } = await service
      .from("hr_benefit_runs")
      .update({
        settings_snapshot: nextSnapshot,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("venue_id", venue.id);

    if (updateError) throw new Error(updateError.message);

    const { warnings } = await persistCalculatedBenefitRun({
      service,
      venueId: venue.id,
      runId,
      kind,
      userId: user.id,
      resultStatus: "draft",
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.run_saved_draft",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_runs",
      entity_id: runId,
      after: {
        kind,
        status: "draft",
        allocationMode: options?.allocationMode ?? null,
      },
    });

    revalidateBenefits(kind, runId);
    return { ok: true, id: runId, warnings };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save benefit run",
    };
  }
}

export async function saveBenefitPoolCollections(
  monthKey: string,
  formData: FormData,
): Promise<BenefitActionResult> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit benefit collections." };
  }

  let benefitMonth: string;
  try {
    benefitMonth = benefitMonthToDate(monthKey);
  } catch {
    return { ok: false, error: "Select a valid benefit month." };
  }

  const oseAmount = Math.max(0, num(formData, "ose_amount", 0));
  const staffActivitiesAmount = Math.max(
    0,
    num(formData, "staff_activities_amount", 0),
  );
  const roundingAmount = Math.max(0, num(formData, "rounding_amount", 0));
  const withheldRetainAmount = Math.max(
    0,
    num(formData, "withheld_retain_amount", 0),
  );
  const benefitDeductionAmount = Math.max(
    0,
    num(formData, "benefit_deduction_amount", 0),
  );
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw || null;

  try {
    const service = createServiceClient();
    const now = new Date().toISOString();
    const payload = {
      venue_id: venue.id,
      benefit_month: benefitMonth,
      ose_amount: oseAmount,
      staff_activities_amount: staffActivitiesAmount,
      rounding_amount: roundingAmount,
      withheld_retain_amount: withheldRetainAmount,
      benefit_deduction_amount: benefitDeductionAmount,
      notes,
      updated_by: user.id,
      updated_at: now,
    };

    const { data: existing, error: lookupError } = await service
      .from("hr_benefit_pool_collections")
      .select("id")
      .eq("venue_id", venue.id)
      .eq("benefit_month", benefitMonth)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    if (existing?.id) {
      const { error } = await service
        .from("hr_benefit_pool_collections")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await service.from("hr_benefit_pool_collections").insert({
        ...payload,
        created_by: user.id,
      });
      if (error) throw new Error(error.message);
    }

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.pool_collections_saved",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_pool_collections",
      entity_id: benefitMonth,
      after: {
        oseAmount,
        staffActivitiesAmount,
        roundingAmount,
        withheldRetainAmount,
        benefitDeductionAmount,
      },
    });

    revalidateBenefits();
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not save pool collections";
    if (/hr_benefit_pool_collections|schema cache|does not exist|rounding_amount|withheld_retain_amount|benefit_deduction_amount/i.test(message)) {
      return {
        ok: false,
        error:
          "Pool collections table needs a migration. Apply supabase/migrations/20260728060000_hr_benefit_pool_collections.sql, 20260728070000_hr_benefit_pool_collections_rounding.sql, 20260826024800_hr_benefit_pool_collections_withheld_retain.sql, and 20260826043700_hr_benefit_pool_collections_benefit_deduction.sql then retry.",
      };
    }
    return { ok: false, error: message };
  }
}

export async function deleteBenefitPoolCollections(
  id: string,
): Promise<BenefitActionResult> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to delete benefit collections." };
  }

  try {
    const service = createServiceClient();
    const { error } = await service
      .from("hr_benefit_pool_collections")
      .delete()
      .eq("id", id)
      .eq("venue_id", venue.id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.pool_collections_deleted",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_pool_collections",
      entity_id: id,
    });

    revalidateBenefits();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete collection",
    };
  }
}

function roundDeductionAmount(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type DeductionWriteFields = {
  name: string;
  total_amount: number;
  benefit_kind: CreateBenefitDeductionInput["benefitKind"];
  target_type: CreateBenefitDeductionInput["target"]["type"];
  department_id: string | null;
  department_name: string | null;
  staff_snapshot: Array<{
    id: string;
    empNo: string | null;
    fullName: string;
  }>;
  month_count: number;
  start_month: string;
  later_split_mode: CreateBenefitDeductionInput["laterSplitMode"];
  updated_by: string;
};

async function buildBenefitDeductionFields(
  input: CreateBenefitDeductionInput,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      user: { id: string };
      venue: { id: string };
      fields: DeductionWriteFields;
      audit: {
        name: string;
        totalAmount: number;
        benefitKind: CreateBenefitDeductionInput["benefitKind"];
        monthCount: number;
        startMonth: string;
        laterSplitMode: CreateBenefitDeductionInput["laterSplitMode"];
      };
    }
> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit benefit deductions." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name the deduction." };

  const totalAmount = roundDeductionAmount(Number(input.totalAmount) || 0);
  if (!(totalAmount > 0)) {
    return { ok: false, error: "Enter a total value greater than zero." };
  }

  if (
    input.benefitKind !== "gratuity" &&
    input.benefitKind !== "service_charge"
  ) {
    return { ok: false, error: "Choose gratuity or service charge." };
  }

  const monthCount = Math.max(1, Math.min(60, Math.round(input.monthCount) || 1));
  const laterSplitMode =
    input.laterSplitMode === "first_run" ? "first_run" : "each_run";
  let startMonth: string;
  try {
    startMonth = benefitMonthToDate(input.startMonth);
  } catch {
    return { ok: false, error: "Choose the month this deduction starts." };
  }

  const staff = input.target.staff
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      empNo: row.empNo == null || row.empNo === "" ? null : String(row.empNo),
      fullName: String(row.fullName ?? "").trim(),
    }))
    .filter((row) => row.id && row.fullName);

  if (staff.length === 0) {
    return {
      ok: false,
      error:
        input.target.type === "department"
          ? "Choose a department that has staff to split this deduction."
          : "Select at least one person.",
    };
  }

  let departmentId: string | null = null;
  let departmentName: string | null = null;
  if (input.target.type === "department") {
    departmentId = input.target.departmentId.trim();
    departmentName = input.target.departmentName.trim();
    if (!departmentId || !departmentName) {
      return { ok: false, error: "Choose a department." };
    }
  } else if (input.target.type !== "people") {
    return { ok: false, error: "Choose who the deduction applies to." };
  }

  const service = createServiceClient();
  const staffIds = staff.map((row) => row.id);
  const { data: staffRows, error: staffError } = await service
    .from("staff")
    .select("id, emp_no, full_name")
    .eq("home_venue_id", venue.id)
    .in("id", staffIds);
  if (staffError) throw new Error(staffError.message);
  const byId = new Map((staffRows ?? []).map((row) => [String(row.id), row]));
  if (byId.size !== staffIds.length) {
    return {
      ok: false,
      error: "One or more selected staff are not in this venue.",
    };
  }

  const snapshot = staff.map((row) => {
    const live = byId.get(row.id);
    return {
      id: row.id,
      empNo: live?.emp_no ? String(live.emp_no) : row.empNo,
      fullName: live?.full_name ? String(live.full_name) : row.fullName,
    };
  });

  if (departmentId) {
    const { data: dept, error: deptError } = await service
      .from("departments")
      .select("id, name")
      .eq("id", departmentId)
      .eq("venue_id", venue.id)
      .maybeSingle();
    if (deptError) throw new Error(deptError.message);
    if (!dept) return { ok: false, error: "Choose a department." };
    departmentName = String(dept.name ?? departmentName);
  }

  return {
    ok: true,
    user,
    venue,
    fields: {
      name,
      total_amount: totalAmount,
      benefit_kind: input.benefitKind,
      target_type: input.target.type,
      department_id: departmentId,
      department_name: departmentName,
      staff_snapshot: snapshot,
      month_count: monthCount,
      start_month: startMonth,
      later_split_mode: laterSplitMode,
      updated_by: user.id,
    },
    audit: {
      name,
      totalAmount,
      benefitKind: input.benefitKind,
      monthCount,
      startMonth,
      laterSplitMode,
    },
  };
}

function deductionWriteError(e: unknown): BenefitActionResult {
  const message = e instanceof Error ? e.message : "Could not save deduction";
  if (/hr_benefit_deductions|schema cache|does not exist/i.test(message)) {
    return {
      ok: false,
      error:
        "Database migration required. Apply supabase/migrations/20260825214611_hr_benefit_deductions.sql and 20260826021400_hr_benefit_deductions_later_split_mode.sql.",
    };
  }
  return { ok: false, error: message };
}

export async function createBenefitDeduction(
  input: CreateBenefitDeductionInput,
): Promise<BenefitActionResult> {
  try {
    const prepared = await buildBenefitDeductionFields(input);
    if (!prepared.ok) return prepared;
    const { user, venue, fields, audit } = prepared;
    const service = createServiceClient();
    const { data: inserted, error } = await service
      .from("hr_benefit_deductions")
      .insert({
        venue_id: venue.id,
        ...fields,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.deduction_created",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_deductions",
      entity_id: String(inserted?.id ?? ""),
      after: audit,
    });

    revalidateBenefits();
    return { ok: true, id: String(inserted?.id ?? "") };
  } catch (e) {
    return deductionWriteError(e);
  }
}

export async function updateBenefitDeduction(
  id: string,
  input: CreateBenefitDeductionInput,
): Promise<BenefitActionResult> {
  const deductionId = id.trim();
  if (!deductionId) return { ok: false, error: "Missing deduction." };

  try {
    const prepared = await buildBenefitDeductionFields(input);
    if (!prepared.ok) return prepared;
    const { user, venue, fields, audit } = prepared;
    const service = createServiceClient();
    const { data: updated, error } = await service
      .from("hr_benefit_deductions")
      .update(fields)
      .eq("id", deductionId)
      .eq("venue_id", venue.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return { ok: false, error: "Deduction not found." };

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.deduction_updated",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_deductions",
      entity_id: deductionId,
      after: audit,
    });

    revalidateBenefits();
    return { ok: true, id: deductionId };
  } catch (e) {
    return deductionWriteError(e);
  }
}

export async function cancelBenefitDeduction(
  id: string,
): Promise<BenefitActionResult> {
  return setBenefitDeductionCancelled(id, true);
}

export async function restoreBenefitDeduction(
  id: string,
): Promise<BenefitActionResult> {
  return setBenefitDeductionCancelled(id, false);
}

async function setBenefitDeductionCancelled(
  id: string,
  cancelled: boolean,
): Promise<BenefitActionResult> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit benefit deductions." };
  }

  const deductionId = id.trim();
  if (!deductionId) return { ok: false, error: "Missing deduction." };

  try {
    const service = createServiceClient();
    const { error } = await service
      .from("hr_benefit_deductions")
      .update({
        cancelled_at: cancelled ? new Date().toISOString() : null,
        updated_by: user.id,
      })
      .eq("id", deductionId)
      .eq("venue_id", venue.id);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: cancelled
        ? "benefits.deduction_cancelled"
        : "benefits.deduction_restored",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_deductions",
      entity_id: deductionId,
    });

    revalidateBenefits();
    return { ok: true, id: deductionId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update deduction",
    };
  }
}

export async function deleteBenefitDeduction(
  id: string,
): Promise<BenefitActionResult> {
  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to edit benefit deductions." };
  }

  const deductionId = id.trim();
  if (!deductionId) return { ok: false, error: "Missing deduction." };

  try {
    const service = createServiceClient();
    const { error } = await service
      .from("hr_benefit_deductions")
      .delete()
      .eq("id", deductionId)
      .eq("venue_id", venue.id);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "benefits.deduction_deleted",
      module_key: HR_MODULE_KEY,
      entity: "hr_benefit_deductions",
      entity_id: deductionId,
    });

    revalidateBenefits();
    return { ok: true, id: deductionId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete deduction",
    };
  }
}

export type BenefitStaffWorkedDaysCalendarResult =
  | {
      ok: true;
      empNo: string;
      fullName: string;
      periodStart: string;
      periodEnd: string;
      dayFractions: PayrollDayFraction[];
    }
  | { ok: false; error: string };

/** Roster calendar for one staff member over a benefit run’s period. */
export async function getBenefitStaffWorkedDaysCalendar(input: {
  runId: string;
  staffId: string;
}): Promise<BenefitStaffWorkedDaysCalendarResult> {
  const runId = input.runId.trim();
  const staffId = input.staffId.trim();
  if (!runId || !staffId) {
    return { ok: false, error: "Run and staff member are required." };
  }

  const auth = await getBenefitsAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions } = auth;
  if (!canAccessBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to view benefit runs." };
  }

  try {
    const service = createServiceClient();
    const { data: run, error: runError } = await service
      .from("hr_benefit_runs")
      .select("id, period_start, period_end")
      .eq("id", runId)
      .eq("venue_id", venue.id)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!run) return { ok: false, error: "Benefit run not found." };

    const periodStart = String(run.period_start).slice(0, 10);
    const periodEnd = String(run.period_end).slice(0, 10);
    if (!periodStart || !periodEnd) {
      return { ok: false, error: "This run has no benefit period dates." };
    }

    const [staffRes, scheduleRes, leaveStored] = await Promise.all([
      service
        .from("staff")
        .select("emp_no, full_name")
        .eq("id", staffId)
        .eq("home_venue_id", venue.id)
        .maybeSingle(),
      service
        .from("hr_schedule_days")
        .select("work_date, label_code")
        .eq("venue_id", venue.id)
        .eq("staff_id", staffId)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd),
      getHrVenueSetting<Partial<HrLeavePolicySettings>>(
        service,
        venue.id,
        HR_SETTINGS_KEYS.leavePolicy,
        {},
      ),
    ]);

    if (staffRes.error) throw new Error(staffRes.error.message);
    if (scheduleRes.error) throw new Error(scheduleRes.error.message);

    const leavePolicy = mergeLeavePolicy(leaveStored);
    const dayFractions: PayrollDayFraction[] = (scheduleRes.data ?? []).map(
      (row) => {
        const label = (row.label_code as string | null) ?? "";
        const frac = payFractionForLabel(label, leavePolicy);
        return {
          workDate: String(row.work_date).slice(0, 10),
          labelCode: label.trim() || "—",
          // Benefits count from roster labels, not payroll clearance.
          approved: Boolean(label.trim()),
          payFraction: frac.payFraction,
          unpaidFraction: frac.unpaidFraction,
          isLeave: frac.isLeave,
          paidStatus: frac.paidStatus,
        };
      },
    );

    return {
      ok: true,
      empNo: String(staffRes.data?.emp_no ?? "").trim(),
      fullName: String(staffRes.data?.full_name ?? "").trim(),
      periodStart,
      periodEnd,
      dayFractions,
    };
  } catch (e) {
    console.error("[benefits] worked-days calendar:", e);
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Could not load worked days for this employee.",
    };
  }
}
