import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findAdjustmentCode,
  mergePayrollAdjustmentCodes,
  type HrPayrollAdjustmentCodesSettings,
} from "@/lib/hr/payroll/adjustment-codes";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  HR_SETTINGS_KEYS,
  type StaffVisaRecord,
  type VisaPenalty,
} from "@/lib/hr/types";
import { normalizeVisaRecord } from "@/lib/hr/visa-store";
import { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Preferred payroll adjustment code for employee-charged visa penalties. */
export const VISA_RUN_DEDUCTION_CODE = "VISA_PROCESSING_FEES";
/** Fallback label when venue settings have not defined the code yet. */
export const VISA_RUN_DEDUCTION_LABEL_FALLBACK =
  "Visa Processing Fees/ Employee Fines";

/**
 * Payroll earning when the employee already paid a fine and the company
 * pays them back. This is a variable benefit (PAYBACK), never a deduction.
 */
export const VISA_RUN_PAYBACK_CODE = "PAYBACK";
export const VISA_RUN_PAYBACK_LABEL_FALLBACK = "Payback";
/** @deprecated Use {@link VISA_RUN_PAYBACK_CODE}. */
export const VISA_RUN_REIMBURSEMENT_CODE = VISA_RUN_PAYBACK_CODE;
/** @deprecated Use {@link VISA_RUN_PAYBACK_LABEL_FALLBACK}. */
export const VISA_RUN_REIMBURSEMENT_LABEL_FALLBACK =
  VISA_RUN_PAYBACK_LABEL_FALLBACK;

function roundMoney(value: number): number {
  return Math.round(Math.abs(value) * 100) / 100;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export type VisaRunDeductionIdentity = {
  code: string;
  label: string;
};

export type VisaRunPayrollIdentity = VisaRunDeductionIdentity & {
  category: "deduction" | "variable";
};

/**
 * Resolve visa-run deduction code/label from venue payroll adjustment-code
 * settings (source of truth). Falls back to VISA_PROCESSING_FEES defaults.
 */
export async function resolveVisaRunDeductionIdentity(opts: {
  service?: ServiceClient | SupabaseClient;
  venueId: string;
}): Promise<VisaRunDeductionIdentity> {
  const service = (opts.service ?? createServiceClient()) as ServiceClient;
  const raw = await getHrVenueSetting<
    Partial<HrPayrollAdjustmentCodesSettings>
  >(
    service as unknown as SupabaseClient,
    opts.venueId,
    HR_SETTINGS_KEYS.payrollAdjustmentCodes,
    {},
  );
  const catalog = mergePayrollAdjustmentCodes(raw);
  const entry = findAdjustmentCode(VISA_RUN_DEDUCTION_CODE, catalog);
  return {
    code: entry?.code ?? VISA_RUN_DEDUCTION_CODE,
    label:
      entry?.label?.trim() ||
      VISA_RUN_DEDUCTION_LABEL_FALLBACK,
  };
}

export async function resolveVisaRunPaybackIdentity(opts: {
  service?: ServiceClient | SupabaseClient;
  venueId: string;
}): Promise<VisaRunPayrollIdentity> {
  const service = (opts.service ?? createServiceClient()) as ServiceClient;
  const raw = await getHrVenueSetting<
    Partial<HrPayrollAdjustmentCodesSettings>
  >(
    service as unknown as SupabaseClient,
    opts.venueId,
    HR_SETTINGS_KEYS.payrollAdjustmentCodes,
    {},
  );
  const catalog = mergePayrollAdjustmentCodes(raw);
  const entry = findAdjustmentCode(VISA_RUN_PAYBACK_CODE, catalog);
  return {
    category: "variable",
    code: entry?.code ?? VISA_RUN_PAYBACK_CODE,
    label: entry?.label?.trim() || VISA_RUN_PAYBACK_LABEL_FALLBACK,
  };
}

/** @deprecated Use {@link resolveVisaRunPaybackIdentity}. */
export const resolveVisaRunReimbursementIdentity = resolveVisaRunPaybackIdentity;

export type VisaEmployeeCharge = {
  penaltyId: string;
  staffId: string;
  amount: number;
  reason: string;
  kind: "deduction" | "payback";
};

/** Penalties that should appear on payroll: employee deductions or paybacks. */
export function employeeChargedPenaltiesFromRecords(
  staffId: string,
  records: StaffVisaRecord[],
): VisaEmployeeCharge[] {
  const out: VisaEmployeeCharge[] = [];
  for (const record of records) {
    for (const penalty of record.penalties) {
      const amount = roundMoney(Number(penalty.amount ?? 0));
      if (!(amount > 0)) continue;
      const penaltyId = String(penalty.id ?? "").trim();
      if (!isUuid(penaltyId)) continue;
      const description = penalty.description.trim() || "Visa penalty / fine";
      if (!penalty.companyCovered) {
        out.push({
          penaltyId,
          staffId,
          amount,
          reason: description,
          kind: "deduction",
        });
        continue;
      }
      if (!penalty.reimburseEmployee) continue;
      out.push({
        penaltyId,
        staffId,
        amount,
        reason: description,
        kind: "payback",
      });
    }
  }
  return out;
}

/** Ensure every penalty has a stable UUID id (needed for source_id links). */
export function stabilizeVisaPenaltyIds(
  records: StaffVisaRecord[],
): { records: StaffVisaRecord[]; changed: boolean } {
  let changed = false;
  const next = records.map((record) => {
    let recordChanged = false;
    const penalties = record.penalties.map((p) => {
      const id = String(p.id ?? "").trim();
      if (isUuid(id)) return p;
      recordChanged = true;
      changed = true;
      return { ...p, id: crypto.randomUUID() } satisfies VisaPenalty;
    });
    if (!recordChanged) return record;
    return { ...record, penalties };
  });
  return { records: next, changed };
}

/**
 * Keep `hr_pending_payroll_deductions` (source `visa_runs`) aligned with
 * employee-charged visa penalties on the staff member's visa history.
 */
export async function syncStaffVisaRunPendingDeductions(opts: {
  service?: ServiceClient;
  venueId: string;
  staffId: string;
  userId?: string | null;
  records: StaffVisaRecord[];
  /** Pre-resolved code/label — avoids reloading settings per staff. */
  identity?: VisaRunDeductionIdentity;
  /** Skip legacy migrate (caller runs it once for the venue). */
  skipMigrate?: boolean;
}): Promise<{ created: number; updated: number; cancelled: number }> {
  const service = opts.service ?? createServiceClient();
  const identity =
    opts.identity ??
    (await resolveVisaRunDeductionIdentity({
      service,
      venueId: opts.venueId,
    }));
  const paybackIdentity = await resolveVisaRunPaybackIdentity({
    service,
    venueId: opts.venueId,
  });
  const payrollIdentityFor = (kind: VisaEmployeeCharge["kind"]) =>
    kind === "payback"
      ? paybackIdentity
      : {
          category: "deduction" as const,
          code: identity.code,
          label: identity.label,
        };
  const { records: stableRecords } = stabilizeVisaPenaltyIds(opts.records);
  const desired = employeeChargedPenaltiesFromRecords(
    opts.staffId,
    stableRecords,
  );

  const { data: existing, error } = await service
    .from("hr_pending_payroll_deductions")
    .select(
      "id, source_id, amount, original_amount, remaining_amount, status, reason, code, label, category",
    )
    .eq("venue_id", opts.venueId)
    .eq("staff_id", opts.staffId)
    .eq("source", "visa_runs")
    .neq("status", "cancelled");

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { created: 0, updated: 0, cancelled: 0 };
    }
    throw new Error(error.message);
  }

  const bySourceId = new Map<
    string,
    {
      id: string;
      source_id: string | null;
      amount: number | string;
      original_amount: number | string | null;
      remaining_amount: number | string | null;
      status: string;
      reason: string | null;
      code: string | null;
      label: string | null;
      category: string | null;
    }
  >();
  for (const row of existing ?? []) {
    const sourceId = row.source_id ? String(row.source_id) : "";
    if (!sourceId) continue;
    bySourceId.set(sourceId, {
      id: String(row.id),
      source_id: sourceId,
      amount: row.amount as number | string,
      original_amount: (row.original_amount as number | string | null) ?? null,
      remaining_amount:
        (row.remaining_amount as number | string | null) ?? null,
      status: String(row.status ?? ""),
      reason: (row.reason as string | null) ?? null,
      code: (row.code as string | null) ?? null,
      label: (row.label as string | null) ?? null,
      category: (row.category as string | null) ?? null,
    });
  }

  let created = 0;
  let updated = 0;
  let cancelled = 0;

  for (const charge of desired) {
    const payroll = payrollIdentityFor(charge.kind);
    const row = bySourceId.get(charge.penaltyId);
    if (!row) {
      const { error: insertError } = await service
        .from("hr_pending_payroll_deductions")
        .insert({
          venue_id: opts.venueId,
          staff_id: opts.staffId,
          category: payroll.category,
          code: payroll.code,
          label: payroll.label,
          amount: charge.amount,
          original_amount: charge.amount,
          remaining_amount: charge.amount,
          reason: charge.reason,
          source: "visa_runs",
          source_id: charge.penaltyId,
          status: "pending",
          created_by: opts.userId ?? null,
        });
      if (insertError) throw new Error(insertError.message);
      created += 1;
      continue;
    }

    bySourceId.delete(charge.penaltyId);

    const original = roundMoney(
      Number(row.original_amount ?? row.amount ?? 0),
    );
    const remaining = roundMoney(
      Number(
        row.remaining_amount ??
          (row.status === "pending" ? row.amount : 0),
      ),
    );
    const recovered = roundMoney(Math.max(0, original - remaining));
    const nextOriginal = charge.amount;
    const nextRemaining = roundMoney(Math.max(0, nextOriginal - recovered));
    const nextStatus = nextRemaining > 0 ? "pending" : "cleared";

    const identityMatches =
      String(row.code ?? "") === payroll.code &&
      String(row.label ?? "") === payroll.label &&
      String(row.category ?? "deduction") === payroll.category;
    const reasonMatches = String(row.reason ?? "") === charge.reason;

    if (
      nextOriginal === original &&
      nextRemaining === remaining &&
      reasonMatches &&
      String(row.status) === nextStatus &&
      identityMatches
    ) {
      continue;
    }

    // Fully recovered rows: still refresh code / label / reason identity.
    if (remaining <= 0 && nextRemaining <= 0 && nextOriginal === original) {
      if (!reasonMatches || !identityMatches) {
        const { error: identityError } = await service
          .from("hr_pending_payroll_deductions")
          .update({
            reason: charge.reason,
            category: payroll.category,
            code: payroll.code,
            label: payroll.label,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (identityError) throw new Error(identityError.message);
        updated += 1;
      }
      continue;
    }

    const { error: updateError } = await service
      .from("hr_pending_payroll_deductions")
      .update({
        amount: nextOriginal,
        original_amount: nextOriginal,
        remaining_amount: nextRemaining,
        reason: charge.reason,
        status: nextStatus,
        category: payroll.category,
        code: payroll.code,
        label: payroll.label,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    updated += 1;
  }

  for (const row of bySourceId.values()) {
    const original = roundMoney(
      Number(row.original_amount ?? row.amount ?? 0),
    );
    const remaining = roundMoney(
      Number(
        row.remaining_amount ??
          (row.status === "pending" ? row.amount : 0),
      ),
    );
    if (remaining <= 0) continue;

    const recovered = roundMoney(Math.max(0, original - remaining));
    if (recovered > 0) {
      const { error: clearError } = await service
        .from("hr_pending_payroll_deductions")
        .update({
          remaining_amount: 0,
          status: "cleared",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (clearError) throw new Error(clearError.message);
    } else {
      const { error: cancelError } = await service
        .from("hr_pending_payroll_deductions")
        .update({
          status: "cancelled",
          remaining_amount: 0,
          amount: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (cancelError) throw new Error(cancelError.message);
    }
    cancelled += 1;
  }

  if (!opts.skipMigrate) {
    await migrateLegacyVisaRunDeductionIdentity({
      service,
      venueId: opts.venueId,
      staffId: opts.staffId,
    });
  }

  return { created, updated, cancelled };
}

/**
 * Remap legacy visa-run payroll identity (code/label) on pending charges,
 * linked adjustments, and run pay lines so open payroll screens pick it up
 * without re-importing. Uses venue adjustment-code settings for the label.
 */
export async function migrateLegacyVisaRunDeductionIdentity(opts: {
  service?: ServiceClient | SupabaseClient;
  venueId: string;
  staffId?: string;
}): Promise<{ pending: number; adjustments: number; lines: number }> {
  const service = (opts.service ?? createServiceClient()) as ServiceClient;
  const identity = await resolveVisaRunDeductionIdentity({
    service,
    venueId: opts.venueId,
  });
  const now = new Date().toISOString();

  // Pending: any visa_runs row still on legacy code VISA.
  let pendingQuery = service
    .from("hr_pending_payroll_deductions")
    .update({
      code: identity.code,
      label: identity.label,
      updated_at: now,
    })
    .eq("venue_id", opts.venueId)
    .eq("source", "visa_runs")
    .eq("code", "VISA")
    .select("id");
  if (opts.staffId) pendingQuery = pendingQuery.eq("staff_id", opts.staffId);

  const { data: pendingUpdated, error: pendingError } = await pendingQuery;
  if (pendingError) {
    if (/does not exist|schema cache/i.test(pendingError.message)) {
      return { pending: 0, adjustments: 0, lines: 0 };
    }
    throw new Error(pendingError.message);
  }
  const pending = pendingUpdated?.length ?? 0;

  // Also refresh label when code is already correct but label drifted from settings.
  let pendingLabelQuery = service
    .from("hr_pending_payroll_deductions")
    .update({
      label: identity.label,
      updated_at: now,
    })
    .eq("venue_id", opts.venueId)
    .eq("source", "visa_runs")
    .eq("code", identity.code)
    .neq("label", identity.label)
    .select("id");
  if (opts.staffId) {
    pendingLabelQuery = pendingLabelQuery.eq("staff_id", opts.staffId);
  }
  const { data: pendingLabelUpdated, error: pendingLabelError } =
    await pendingLabelQuery;
  if (pendingLabelError) throw new Error(pendingLabelError.message);

  // Adjustments still carrying legacy VISA code (or old immigration label).
  let adjQuery = service
    .from("hr_payroll_adjustments")
    .update({
      code: identity.code,
      label: identity.label,
    })
    .eq("venue_id", opts.venueId)
    .eq("code", "VISA")
    .select("id");
  if (opts.staffId) adjQuery = adjQuery.eq("staff_id", opts.staffId);
  const { data: adjUpdated, error: adjError } = await adjQuery;
  if (adjError) throw new Error(adjError.message);

  let adjLabelQuery = service
    .from("hr_payroll_adjustments")
    .update({ label: identity.label })
    .eq("venue_id", opts.venueId)
    .eq("code", identity.code)
    .neq("label", identity.label)
    .select("id");
  if (opts.staffId) adjLabelQuery = adjLabelQuery.eq("staff_id", opts.staffId);
  const { data: adjLabelUpdated, error: adjLabelError } = await adjLabelQuery;
  if (adjLabelError) throw new Error(adjLabelError.message);

  // Pay lines (no staff_id — optional scope via run employees).
  let runEmployeeIds: string[] | null = null;
  if (opts.staffId) {
    const { data: runEmps, error: runEmpError } = await service
      .from("hr_payroll_run_employees")
      .select("id")
      .eq("venue_id", opts.venueId)
      .eq("staff_id", opts.staffId);
    if (runEmpError) throw new Error(runEmpError.message);
    runEmployeeIds = (runEmps ?? []).map((r) => String(r.id));
    if (runEmployeeIds.length === 0) {
      const payback = await migrateLegacyVisaRunPaybackIdentity({
        service,
        venueId: opts.venueId,
        staffId: opts.staffId,
      });
      return {
        pending:
          pending + (pendingLabelUpdated?.length ?? 0) + payback.pending,
        adjustments:
          (adjUpdated?.length ?? 0) +
          (adjLabelUpdated?.length ?? 0) +
          payback.adjustments,
        lines: 0,
      };
    }
  }

  let lineQuery = service
    .from("hr_payroll_lines")
    .update({
      code: identity.code,
      label: identity.label,
    })
    .eq("venue_id", opts.venueId)
    .eq("code", "VISA")
    .select("id");
  if (runEmployeeIds) {
    lineQuery = lineQuery.in("run_employee_id", runEmployeeIds);
  }
  const { data: lineUpdated, error: lineError } = await lineQuery;
  if (lineError && !/does not exist|schema cache/i.test(lineError.message)) {
    throw new Error(lineError.message);
  }

  let lineLabelQuery = service
    .from("hr_payroll_lines")
    .update({ label: identity.label })
    .eq("venue_id", opts.venueId)
    .eq("code", identity.code)
    .neq("label", identity.label)
    .select("id");
  if (runEmployeeIds) {
    lineLabelQuery = lineLabelQuery.in("run_employee_id", runEmployeeIds);
  }
  const { data: lineLabelUpdated, error: lineLabelError } =
    await lineLabelQuery;
  if (lineLabelError && !/does not exist|schema cache/i.test(lineLabelError.message)) {
    throw new Error(lineLabelError.message);
  }

  const payback = await migrateLegacyVisaRunPaybackIdentity({
    service,
    venueId: opts.venueId,
    staffId: opts.staffId,
  });

  return {
    pending:
      pending + (pendingLabelUpdated?.length ?? 0) + payback.pending,
    adjustments:
      (adjUpdated?.length ?? 0) +
      (adjLabelUpdated?.length ?? 0) +
      payback.adjustments,
    lines: (lineUpdated?.length ?? 0) + (lineLabelUpdated?.length ?? 0),
  };
}

/**
 * Remap visa-run "employee already paid" charges from legacy reimbursement /
 * deduction identity onto PAYBACK (variable benefit).
 */
async function migrateLegacyVisaRunPaybackIdentity(opts: {
  service: ServiceClient;
  venueId: string;
  staffId?: string;
}): Promise<{ pending: number; adjustments: number }> {
  const identity = await resolveVisaRunPaybackIdentity({
    service: opts.service,
    venueId: opts.venueId,
  });
  const now = new Date().toISOString();

  let pendingQuery = opts.service
    .from("hr_pending_payroll_deductions")
    .select("id, code, label, category")
    .eq("venue_id", opts.venueId)
    .eq("source", "visa_runs")
    .neq("status", "cancelled");
  if (opts.staffId) pendingQuery = pendingQuery.eq("staff_id", opts.staffId);

  const { data: pendingRows, error: pendingError } = await pendingQuery;
  if (pendingError) {
    if (/does not exist|schema cache/i.test(pendingError.message)) {
      return { pending: 0, adjustments: 0 };
    }
    throw new Error(pendingError.message);
  }

  const isPaybackRow = (row: {
    code: string | null;
    category: string | null;
  }) => {
    const category = String(row.category ?? "deduction");
    const code = String(row.code ?? "").toUpperCase();
    return category === "variable" || code === "REIMBURSEMENT";
  };

  const toRemap = (pendingRows ?? []).filter((row) => {
    if (!isPaybackRow(row)) return false;
    const code = String(row.code ?? "").toUpperCase();
    const category = String(row.category ?? "deduction");
    const label = String(row.label ?? "");
    return (
      code !== identity.code ||
      category !== identity.category ||
      label !== identity.label
    );
  });

  // Variable visa-run rows (and legacy reimbursement codes) become PAYBACK.
  const remapIds = toRemap.map((row) => String(row.id));
  if (remapIds.length > 0) {
    const { error: remapError } = await opts.service
      .from("hr_pending_payroll_deductions")
      .update({
        category: identity.category,
        code: identity.code,
        label: identity.label,
        updated_at: now,
      })
      .in("id", remapIds);
    if (remapError) throw new Error(remapError.message);
  }

  const paybackPendingIds = (pendingRows ?? [])
    .filter((row) => isPaybackRow(row))
    .map((row) => String(row.id));

  if (paybackPendingIds.length === 0) {
    return { pending: remapIds.length, adjustments: 0 };
  }

  const { data: apps, error: appsError } = await opts.service
    .from("hr_payroll_deduction_applications")
    .select("adjustment_id")
    .in("pending_deduction_id", paybackPendingIds);
  if (appsError) {
    if (/does not exist|schema cache/i.test(appsError.message)) {
      return { pending: remapIds.length, adjustments: 0 };
    }
    throw new Error(appsError.message);
  }

  const adjustmentIds = [
    ...new Set(
      (apps ?? [])
        .map((a) => a.adjustment_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (adjustmentIds.length === 0) {
    return { pending: remapIds.length, adjustments: 0 };
  }

  const { data: adjUpdated, error: adjError } = await opts.service
    .from("hr_payroll_adjustments")
    .update({
      category: identity.category,
      code: identity.code,
      label: identity.label,
      source: "benefits",
    })
    .in("id", adjustmentIds)
    .select("id");
  if (adjError) throw new Error(adjError.message);

  return {
    pending: remapIds.length,
    adjustments: adjUpdated?.length ?? 0,
  };
}

/**
 * Backfill / refresh visa-run pending deductions for a venue from stored
 * visa history. Safe to call from Import Deductions (prefer background).
 */
export async function ensureVenueVisaRunPendingDeductions(opts: {
  service?: ServiceClient | SupabaseClient;
  venueId: string;
  userId?: string | null;
}): Promise<{ staffSynced: number }> {
  const service = (opts.service ?? createServiceClient()) as ServiceClient;
  const identity = await resolveVisaRunDeductionIdentity({
    service,
    venueId: opts.venueId,
  });

  const { data: historyRows, error } = await service
    .from("hr_venue_settings")
    .select("key, value")
    .eq("venue_id", opts.venueId)
    .like("key", `${HR_SETTINGS_KEYS.staffVisaHistoryPrefix}%`);

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { staffSynced: 0 };
    }
    console.error("[payroll] visa run ensure history:", error.message);
    return { staffSynced: 0 };
  }

  type WorkItem = {
    staffId: string;
    key: string;
    records: StaffVisaRecord[];
    needStabilize: boolean;
  };

  const work: WorkItem[] = [];
  for (const row of historyRows ?? []) {
    const key = String(row.key ?? "");
    if (!key.startsWith(HR_SETTINGS_KEYS.staffVisaHistoryPrefix)) continue;
    const staffId = key.slice(HR_SETTINGS_KEYS.staffVisaHistoryPrefix.length);
    if (!isUuid(staffId)) continue;

    const raw = (row.value ?? {}) as { records?: unknown };
    const parsed = Array.isArray(raw.records)
      ? raw.records
          .map((item) =>
            normalizeVisaRecord(item as Partial<StaffVisaRecord>),
          )
          .filter((item): item is StaffVisaRecord => item != null)
      : [];

    const { records, changed } = stabilizeVisaPenaltyIds(parsed);
    // Skip staff with nothing employee-charged and no existing need to stabilize.
    const charges = employeeChargedPenaltiesFromRecords(staffId, records);
    if (charges.length === 0 && !changed) continue;

    work.push({
      staffId,
      key,
      records,
      needStabilize: changed,
    });
  }

  const CONCURRENCY = 6;
  let staffSynced = 0;
  for (let i = 0; i < work.length; i += CONCURRENCY) {
    const batch = work.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (item) => {
        if (item.needStabilize) {
          const { error: saveError } = await service
            .from("hr_venue_settings")
            .upsert(
              {
                venue_id: opts.venueId,
                key: item.key,
                value: { records: item.records },
                updated_at: new Date().toISOString(),
              },
              { onConflict: "venue_id,key" },
            );
          if (saveError) {
            console.error(
              "[payroll] visa run stabilize ids:",
              saveError.message,
            );
          }
        }

        await syncStaffVisaRunPendingDeductions({
          service,
          venueId: opts.venueId,
          staffId: item.staffId,
          userId: opts.userId ?? null,
          records: item.records,
          identity,
          skipMigrate: true,
        });
        return 1;
      }),
    );
    staffSynced += results.reduce((sum, n) => sum + n, 0);
  }

  await migrateLegacyVisaRunDeductionIdentity({
    service,
    venueId: opts.venueId,
  });

  return { staffSynced };
}
