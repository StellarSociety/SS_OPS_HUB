"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import type { ActionAuthContext, ActionAuthFailure } from "@/lib/auth/action-context";
import { canAccessAssets, canEditAssets } from "@/lib/hr/permissions";
import { HR_MODULE_KEY } from "@/lib/hr/types";
import {
  listUniformItemsForStaff,
  upsertUniformStaffArchive,
} from "@/lib/hr/uniform-store";
import { convertImageToWebp } from "@/lib/storage/convert-to-webp";
import { trashFile, credentialsFromSettings, ensureAccessToken } from "@/lib/hr/workdrive/client";
import { loadAssetsWorkDriveSettings } from "@/lib/hr/workdrive/settings";
import {
  uniformPieceWorkDriveDownloadPath,
  uploadUniformPieceImageToWorkDrive,
} from "@/lib/hr/workdrive/upload";
import { createServiceClient } from "@/lib/supabase/service";

const UNIFORM_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const RASTER_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const entitlementSchema = z.object({
  departmentId: z.string().uuid(),
  positionId: z.string().uuid().nullable().optional(),
});

const createPieceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  details: z.string().trim().max(1000).optional(),
  supplierId: z.string().uuid().nullable().optional(),
  productStatus: z.enum(["active", "old"]).default("active"),
  unitValue: z.coerce.number().min(0).max(999_999_999).optional(),
  entitlements: z.array(entitlementSchema).optional().default([]),
  stockReceipts: z
    .array(
      z.object({
        receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        quantity: z.coerce.number().int().min(1).max(999_999),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .optional(),
});

const updatePieceSchema = createPieceSchema.extend({
  pieceId: z.string().uuid(),
});

const pieceIdSchema = z.object({
  pieceId: z.string().uuid(),
});

const staffItemSchema = z.object({
  staffId: z.string().uuid(),
  pieceId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(999),
  providedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).optional(),
});

const batchAssignSchema = z.object({
  staffId: z.string().uuid(),
  items: z
    .array(
      z.object({
        pieceId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(999),
        providedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1, "Add at least one uniform piece."),
});

const updateStaffItemSchema = staffItemSchema.extend({
  itemId: z.string().uuid(),
});

const itemIdSchema = z.object({
  itemId: z.string().uuid(),
});

function revalidateUniformPaths() {
  revalidatePath("/hr/assets/uniform/details");
  revalidatePath("/hr/assets/uniform/employees");
}

function assertEdit(ctx: ActionAuthContext | ActionAuthFailure): ActionAuthContext {
  if ("error" in ctx) throw new Error(ctx.error);
  if (!canEditAssets(ctx.permissions, ctx.venue.id)) {
    throw new Error("You do not have permission to manage uniforms.");
  }
  return ctx;
}

export async function listStaffUniforms(input: { staffId: string }) {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) throw new Error(ctx.error);
  if (!canAccessAssets(ctx.permissions, ctx.venue.id)) {
    throw new Error("You do not have permission to view uniforms.");
  }

  const service = createServiceClient();
  return listUniformItemsForStaff(service, input.staffId);
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function replaceEntitlements(
  service: ServiceClient,
  pieceId: string,
  entitlements: z.infer<typeof entitlementSchema>[],
) {
  const { error: deleteError } = await service
    .from("hr_uniform_piece_entitlements")
    .delete()
    .eq("piece_id", pieceId);

  if (deleteError) throw new Error(deleteError.message);

  if (entitlements.length === 0) return;

  const { error: insertError } = await service
    .from("hr_uniform_piece_entitlements")
    .insert(
      entitlements.map((row) => ({
        piece_id: pieceId,
        department_id: row.departmentId,
        position_id: row.positionId ?? null,
      })),
    );

  if (insertError) throw new Error(insertError.message);
}

async function replaceStockReceipts(
  service: ServiceClient,
  pieceId: string,
  receipts: Array<{
    receivedAt: string;
    quantity: number;
    notes?: string;
  }>,
  createdBy: string,
) {
  const { error: deleteError } = await service
    .from("hr_uniform_stock_receipts")
    .delete()
    .eq("piece_id", pieceId);

  if (deleteError) throw new Error(deleteError.message);

  if (receipts.length === 0) return;

  const { error: insertError } = await service
    .from("hr_uniform_stock_receipts")
    .insert(
      receipts.map((row) => ({
        piece_id: pieceId,
        received_at: row.receivedAt,
        quantity: row.quantity,
        notes: row.notes ?? "",
        created_by: createdBy,
      })),
    );

  if (insertError) throw new Error(insertError.message);
}

async function resolveSupplierSnapshot(
  service: ServiceClient,
  supplierId: string | null | undefined,
) {
  if (!supplierId) {
    return {
      supplier_id: null,
      supplier: "",
      supplier_orders_email: "",
      contact_person: "",
      contact_phone: "",
    };
  }

  const { data, error } = await service
    .from("hr_uniform_suppliers")
    .select("id, name, orders_email, contact_person, contact_phone")
    .eq("id", supplierId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Supplier not found.");

  return {
    supplier_id: data.id,
    supplier: data.name,
    supplier_orders_email: data.orders_email ?? "",
    contact_person: data.contact_person ?? "",
    contact_phone: data.contact_phone ?? "",
  };
}

export async function createUniformPiece(
  input: z.infer<typeof createPieceSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = createPieceSchema.parse(input);
  const service = createServiceClient();
  const supplierFields = await resolveSupplierSnapshot(
    service,
    parsed.supplierId,
  );

  const { data, error } = await service
    .from("hr_uniform_pieces")
    .insert({
      name: parsed.name,
      details: parsed.details ?? "",
      ...supplierFields,
      product_status: parsed.productStatus,
      unit_value: parsed.unitValue ?? 0,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await Promise.all([
    replaceEntitlements(service, data.id, parsed.entitlements),
    replaceStockReceipts(
      service,
      data.id,
      parsed.stockReceipts ?? [],
      ctx.user.id,
    ),
    writeAuditLog({
      actor_id: ctx.user.id,
      action: "create",
      module_key: HR_MODULE_KEY,
      entity: "hr_uniform_pieces",
      entity_id: data.id,
      venue_id: ctx.venue.id,
      after: parsed,
    }),
  ]);

  revalidateUniformPaths();
  return { id: data.id };
}

export async function updateUniformPiece(
  input: z.infer<typeof updatePieceSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = updatePieceSchema.parse(input);
  const service = createServiceClient();

  const supplierFields = await resolveSupplierSnapshot(
    service,
    parsed.supplierId,
  );

  const { data: updated, error } = await service
    .from("hr_uniform_pieces")
    .update({
      name: parsed.name,
      details: parsed.details ?? "",
      ...supplierFields,
      product_status: parsed.productStatus,
      unit_value: parsed.unitValue ?? 0,
    })
    .eq("id", parsed.pieceId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updated) throw new Error("Uniform piece not found.");

  await Promise.all([
    replaceEntitlements(service, parsed.pieceId, parsed.entitlements),
    replaceStockReceipts(
      service,
      parsed.pieceId,
      parsed.stockReceipts ?? [],
      ctx.user.id,
    ),
    writeAuditLog({
      actor_id: ctx.user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_uniform_pieces",
      entity_id: parsed.pieceId,
      venue_id: ctx.venue.id,
      after: parsed,
    }),
  ]);

  revalidateUniformPaths();
}

export async function deleteUniformPiece(input: z.infer<typeof pieceIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = pieceIdSchema.parse(input);
  const service = createServiceClient();

  const { count, error: countError } = await service
    .from("hr_uniform_staff_items")
    .select("id", { count: "exact", head: true })
    .eq("piece_id", parsed.pieceId);

  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error("Remove employee assignments before deleting this uniform piece.");
  }

  const { error } = await service
    .from("hr_uniform_pieces")
    .delete()
    .eq("id", parsed.pieceId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_pieces",
    entity_id: parsed.pieceId,
    venue_id: ctx.venue.id,
  });

  revalidateUniformPaths();
}

export async function assignUniformToStaff(
  input: z.infer<typeof staffItemSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = staffItemSchema.parse(input);
  const service = createServiceClient();

  const { data, error } = await service
    .from("hr_uniform_staff_items")
    .insert({
      staff_id: parsed.staffId,
      piece_id: parsed.pieceId,
      quantity: parsed.quantity,
      provided_at: parsed.providedAt,
      notes: parsed.notes ?? "",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_staff_items",
    entity_id: data.id,
    venue_id: ctx.venue.id,
    after: parsed,
  });

  revalidateUniformPaths();
  return { id: data.id };
}

export async function assignUniformsToStaff(
  input: z.infer<typeof batchAssignSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = batchAssignSchema.parse(input);
  const service = createServiceClient();

  const { data, error } = await service
    .from("hr_uniform_staff_items")
    .insert(
      parsed.items.map((item) => ({
        staff_id: parsed.staffId,
        piece_id: item.pieceId,
        quantity: item.quantity,
        provided_at: item.providedAt,
        notes: item.notes ?? "",
        created_by: ctx.user.id,
      })),
    )
    .select("id");

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_staff_items",
    entity_id: data?.[0]?.id ?? parsed.staffId,
    venue_id: ctx.venue.id,
    after: { staffId: parsed.staffId, count: parsed.items.length, items: parsed.items },
  });

  revalidateUniformPaths();
  return { ids: (data ?? []).map((row) => row.id), count: data?.length ?? 0 };
}

export async function updateUniformStaffItem(
  input: z.infer<typeof updateStaffItemSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = updateStaffItemSchema.parse(input);
  const service = createServiceClient();

  const { error } = await service
    .from("hr_uniform_staff_items")
    .update({
      staff_id: parsed.staffId,
      piece_id: parsed.pieceId,
      quantity: parsed.quantity,
      provided_at: parsed.providedAt,
      notes: parsed.notes ?? "",
    })
    .eq("id", parsed.itemId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_staff_items",
    entity_id: parsed.itemId,
    venue_id: ctx.venue.id,
    after: parsed,
  });

  revalidateUniformPaths();
}

export async function deleteUniformStaffItem(input: z.infer<typeof itemIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = itemIdSchema.parse(input);
  const service = createServiceClient();

  const { error } = await service
    .from("hr_uniform_staff_items")
    .delete()
    .eq("id", parsed.itemId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_staff_items",
    entity_id: parsed.itemId,
    venue_id: ctx.venue.id,
  });

  revalidateUniformPaths();
}

const replaceUniformsSchema = z.object({
  staffId: z.string().uuid(),
  chargedToEmployee: z.boolean(),
  notes: z.string().trim().max(1000).optional().default(""),
  lines: z
    .array(
      z.object({
        staffItemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(999),
      }),
    )
    .min(1, "Select at least one piece to replace."),
});

export type InitiateUniformReplacementResult = {
  replacementIds: string[];
  pendingDeductionId: string | null;
  deductionAmount: number;
  chargedToEmployee: boolean;
  lines: { name: string; quantity: number; lineValue: number }[];
  attachedToPayrollRunId: string | null;
};

export async function initiateUniformReplacement(
  input: z.infer<typeof replaceUniformsSchema>,
): Promise<InitiateUniformReplacementResult> {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = replaceUniformsSchema.parse(input);
  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const notes = parsed.notes?.trim() ?? "";

  const { data: staffRow, error: staffError } = await service
    .from("staff")
    .select("id, emp_no, full_name, home_venue_id")
    .eq("id", parsed.staffId)
    .maybeSingle();
  if (staffError) throw new Error(staffError.message);
  if (!staffRow) throw new Error("Staff member not found.");

  const itemIds = parsed.lines.map((line) => line.staffItemId);
  const { data: itemRows, error: itemsError } = await service
    .from("hr_uniform_staff_items")
    .select(
      `
      id,
      staff_id,
      piece_id,
      quantity,
      piece:hr_uniform_pieces(id, name, unit_value)
    `,
    )
    .in("id", itemIds)
    .eq("staff_id", parsed.staffId);

  if (itemsError) throw new Error(itemsError.message);
  const items = itemRows ?? [];
  if (items.length !== parsed.lines.length) {
    throw new Error("One or more uniform assignments could not be found.");
  }

  const itemById = new Map(items.map((row) => [row.id as string, row]));
  const resolvedLines: {
    staffItemId: string;
    pieceId: string;
    pieceName: string;
    unitValue: number;
    quantity: number;
    lineValue: number;
    currentQty: number;
  }[] = [];

  for (const line of parsed.lines) {
    const row = itemById.get(line.staffItemId);
    if (!row) throw new Error("Uniform assignment not found.");
    const currentQty = Number(row.quantity ?? 0);
    if (line.quantity > currentQty) {
      throw new Error(
        `Cannot replace more than on-hand quantity for one of the selected pieces.`,
      );
    }
    const pieceRaw = row.piece as
      | { id: string; name: string; unit_value: number | string }
      | { id: string; name: string; unit_value: number | string }[]
      | null;
    const piece = Array.isArray(pieceRaw) ? pieceRaw[0] : pieceRaw;
    const unitValue = Number(piece?.unit_value ?? 0);
    resolvedLines.push({
      staffItemId: line.staffItemId,
      pieceId: String(row.piece_id),
      pieceName: String(piece?.name ?? "Uniform piece"),
      unitValue,
      quantity: line.quantity,
      lineValue: unitValue * line.quantity,
      currentQty,
    });
  }

  const deductionAmount = parsed.chargedToEmployee
    ? Math.round(
        resolvedLines.reduce((sum, line) => sum + line.lineValue, 0) * 100,
      ) / 100
    : 0;

  // Apply assignment changes: reduce/remove old, issue fresh replacements.
  for (const line of resolvedLines) {
    const remaining = line.currentQty - line.quantity;
    if (remaining > 0) {
      const { error } = await service
        .from("hr_uniform_staff_items")
        .update({ quantity: remaining })
        .eq("id", line.staffItemId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await service
        .from("hr_uniform_staff_items")
        .delete()
        .eq("id", line.staffItemId);
      if (error) throw new Error(error.message);
    }

    const { error: insertError } = await service
      .from("hr_uniform_staff_items")
      .insert({
        staff_id: parsed.staffId,
        piece_id: line.pieceId,
        quantity: line.quantity,
        provided_at: today,
        notes:
          notes ||
          `Replacement issued${parsed.chargedToEmployee ? " (employee-charged)" : ""}`,
        created_by: ctx.user.id,
      });
    if (insertError) throw new Error(insertError.message);
  }

  let pendingDeductionId: string | null = null;
  if (parsed.chargedToEmployee && deductionAmount > 0) {
    const pieceSummary = resolvedLines
      .map((line) => `${line.pieceName} × ${line.quantity}`)
      .join(", ");
    const { data: pending, error: pendingError } = await service
      .from("hr_pending_payroll_deductions")
      .insert({
        venue_id: ctx.venue.id,
        staff_id: parsed.staffId,
        category: "deduction",
        code: "UNIFORM",
        label: "Uniform / equipment",
        amount: deductionAmount,
        original_amount: deductionAmount,
        remaining_amount: deductionAmount,
        reason: `Uniform replacement: ${pieceSummary}`,
        source: "uniform_replacement",
        status: "pending",
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (pendingError) throw new Error(pendingError.message);
    pendingDeductionId = pending.id as string;
  }

  const { data: replacements, error: replacementError } = await service
    .from("hr_uniform_replacements")
    .insert(
      resolvedLines.map((line) => ({
        venue_id: ctx.venue.id,
        staff_id: parsed.staffId,
        piece_id: line.pieceId,
        staff_item_id: remainingItemIdAfterReplace(line),
        quantity: line.quantity,
        unit_value: line.unitValue,
        charged_to_employee: parsed.chargedToEmployee,
        deduction_amount: parsed.chargedToEmployee ? line.lineValue : 0,
        notes,
        pending_deduction_id: pendingDeductionId,
        created_by: ctx.user.id,
      })),
    )
    .select("id");

  if (replacementError) throw new Error(replacementError.message);
  const replacementIds = (replacements ?? []).map((row) => row.id as string);

  if (pendingDeductionId) {
    await service
      .from("hr_pending_payroll_deductions")
      .update({ source_id: replacementIds[0] ?? null })
      .eq("id", pendingDeductionId);
  }

  let attachedToPayrollRunId: string | null = null;
  if (pendingDeductionId) {
    attachedToPayrollRunId = await tryAttachPendingDeductionToOpenRun({
      service,
      venueId: ctx.venue.id,
      staffId: parsed.staffId,
      userId: ctx.user.id,
    });
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "uniform_replacement.created",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_replacements",
    entity_id: replacementIds[0] ?? parsed.staffId,
    venue_id: ctx.venue.id,
    after: {
      staffId: parsed.staffId,
      chargedToEmployee: parsed.chargedToEmployee,
      deductionAmount,
      pendingDeductionId,
      replacementIds,
      attachedToPayrollRunId,
      lines: resolvedLines.map((line) => ({
        pieceId: line.pieceId,
        quantity: line.quantity,
        lineValue: line.lineValue,
      })),
    },
  });

  revalidateUniformPaths();
  revalidatePath("/hr/payroll");

  return {
    replacementIds,
    pendingDeductionId,
    deductionAmount,
    chargedToEmployee: parsed.chargedToEmployee,
    lines: resolvedLines.map((line) => ({
      name: line.pieceName,
      quantity: line.quantity,
      lineValue: line.lineValue,
    })),
    attachedToPayrollRunId,
  };
}

/** staff_item_id on replacement points at the original item when it still exists. */
function remainingItemIdAfterReplace(line: {
  staffItemId: string;
  currentQty: number;
  quantity: number;
}): string | null {
  return line.currentQty - line.quantity > 0 ? line.staffItemId : null;
}

type PendingDeductionJoin = {
  id: string;
  status: string;
  amount: number | string;
  applied_run_id: string | null;
  applied_adjustment_id: string | null;
  reason?: string | null;
};

function unwrapPending(
  raw:
    | PendingDeductionJoin
    | PendingDeductionJoin[]
    | null
    | undefined,
): PendingDeductionJoin | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function isPayrollRunMutable(status: string | null | undefined): boolean {
  if (!status) return false;
  return (
    status !== "paid" &&
    status !== "locked" &&
    status !== "payment_processing"
  );
}

async function recalculateStaffOnPayrollRun(opts: {
  service: ServiceClient;
  venueId: string;
  runId: string;
  payrollMonth: string;
  staffId: string;
  userId: string;
}): Promise<void> {
  const { persistSingleEmployeePayroll, loadPayrollSettings } = await import(
    "@/lib/hr/payroll/persist-run"
  );
  const { resolvePayrollPeriod } = await import("@/lib/hr/payroll/period");
  const settings = await loadPayrollSettings(
    opts.service as never,
    opts.venueId,
  );
  const period = resolvePayrollPeriod(String(opts.payrollMonth), settings);
  await persistSingleEmployeePayroll({
    service: opts.service,
    venueId: opts.venueId,
    runId: opts.runId,
    staffId: opts.staffId,
    period,
    userId: opts.userId,
  });
}

async function tryAttachPendingDeductionToOpenRun(opts: {
  service: ServiceClient;
  venueId: string;
  staffId: string;
  userId: string;
}): Promise<string | null> {
  // Pending charges stay queued until payroll → Import Deductions.
  // Selective apply/unapply happens there so HR can choose what hits the month.
  void opts;
  return null;
}

/** Sum charged line amounts for replacements sharing a pending deduction. */
async function sumSiblingDeductionAmount(
  service: ServiceClient,
  pendingDeductionId: string,
  excludeReplacementId?: string,
): Promise<number> {
  let query = service
    .from("hr_uniform_replacements")
    .select("id, charged_to_employee, deduction_amount")
    .eq("pending_deduction_id", pendingDeductionId);
  if (excludeReplacementId) {
    query = query.neq("id", excludeReplacementId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const total = (data ?? []).reduce((sum, row) => {
    if (!row.charged_to_employee) return sum;
    return sum + Number(row.deduction_amount ?? 0);
  }, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Keep pending deduction + payroll adjustment in sync after a replacement change.
 * Allows edits while the applied run is still open; blocks locked/paid runs.
 */
async function syncUniformPendingDeduction(opts: {
  service: ServiceClient;
  venueId: string;
  staffId: string;
  userId: string;
  pendingDeductionId: string | null;
  pending: PendingDeductionJoin | null;
  /** Total amount that should remain on the shared pending deduction. */
  nextAmount: number;
  reason: string;
  /** When creating a brand-new pending row (no prior link). */
  createIfMissing?: {
    sourceId: string;
    pieceLabel: string;
  };
}): Promise<{
  pendingDeductionId: string | null;
  syncedRunId: string | null;
}> {
  const {
    service,
    venueId,
    staffId,
    userId,
    pending,
    nextAmount,
    reason,
  } = opts;
  let pendingDeductionId = opts.pendingDeductionId;
  let syncedRunId: string | null = null;

  if (pending?.status === "applied" || pending?.status === "cleared") {
    const runId = pending.applied_run_id;
    if (!runId) {
      throw new Error(
        "This deduction is marked applied but has no payroll run. Contact support.",
      );
    }
    const { data: run, error: runError } = await service
      .from("hr_payroll_runs")
      .select("id, status, payroll_month")
      .eq("id", runId)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!run) throw new Error("Linked payroll run was not found.");
    if (!isPayrollRunMutable(String(run.status))) {
      throw new Error(
        "This deduction is on a locked or paid payroll run and cannot be changed. Reopen that month's payroll first, or add a correction on the next run.",
      );
    }

    if (nextAmount > 0) {
      const { error: pendingError } = await service
        .from("hr_pending_payroll_deductions")
        .update({
          amount: nextAmount,
          original_amount: nextAmount,
          remaining_amount: 0,
          reason,
          status: "cleared",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pending.id);
      if (pendingError) throw new Error(pendingError.message);

      if (pending.applied_adjustment_id) {
        const { error: adjError } = await service
          .from("hr_payroll_adjustments")
          .update({
            amount: nextAmount,
            reason,
          })
          .eq("id", pending.applied_adjustment_id)
          .eq("run_id", runId);
        if (adjError) throw new Error(adjError.message);
      } else {
        // Orphan applied row — recreate the adjustment via promote path.
        const { data: runEmp } = await service
          .from("hr_payroll_run_employees")
          .select("id")
          .eq("run_id", runId)
          .eq("staff_id", staffId)
          .maybeSingle();
        const { data: inserted, error: insertError } = await service
          .from("hr_payroll_adjustments")
          .insert({
            venue_id: venueId,
            run_id: runId,
            run_employee_id: runEmp?.id ?? null,
            staff_id: staffId,
            category: "deduction",
            code: "UNIFORM",
            label: "Uniform / equipment",
            amount: nextAmount,
            percent_of_daily_rate: null,
            days_applied: null,
            reason,
            source: "manual",
            created_by: userId,
          })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        await service
          .from("hr_pending_payroll_deductions")
          .update({
            applied_adjustment_id: inserted.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pending.id);
      }

      await recalculateStaffOnPayrollRun({
        service,
        venueId,
        runId,
        payrollMonth: String(run.payroll_month),
        staffId,
        userId,
      });
      syncedRunId = runId;
      return { pendingDeductionId: pending.id, syncedRunId };
    }

    // nextAmount === 0 → remove from this month's payroll
    if (pending.applied_adjustment_id) {
      const { error: adjError } = await service
        .from("hr_payroll_adjustments")
        .delete()
        .eq("id", pending.applied_adjustment_id)
        .eq("run_id", runId);
      if (adjError) throw new Error(adjError.message);
    }
    const { error: cancelError } = await service
      .from("hr_pending_payroll_deductions")
      .update({
        status: "cancelled",
        amount: 0,
        remaining_amount: 0,
        applied_adjustment_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending.id);
    if (cancelError) throw new Error(cancelError.message);

    await recalculateStaffOnPayrollRun({
      service,
      venueId,
      runId,
      payrollMonth: String(run.payroll_month),
      staffId,
      userId,
    });
    syncedRunId = runId;
    return { pendingDeductionId: null, syncedRunId };
  }

  // Not yet applied (or no pending row)
  if (nextAmount > 0) {
    if (pendingDeductionId && pending?.status === "pending") {
      const { error } = await service
        .from("hr_pending_payroll_deductions")
        .update({
          amount: nextAmount,
          original_amount: nextAmount,
          remaining_amount: nextAmount,
          reason,
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingDeductionId)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
    } else {
      const create = opts.createIfMissing;
      if (!create) {
        throw new Error("Cannot create payroll deduction without source context.");
      }
      const { data: created, error } = await service
        .from("hr_pending_payroll_deductions")
        .insert({
          venue_id: venueId,
          staff_id: staffId,
          category: "deduction",
          code: "UNIFORM",
          label: "Uniform / equipment",
          amount: nextAmount,
          original_amount: nextAmount,
          remaining_amount: nextAmount,
          reason,
          source: "uniform_replacement",
          source_id: create.sourceId,
          status: "pending",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      pendingDeductionId = created.id as string;
    }
    syncedRunId = await tryAttachPendingDeductionToOpenRun({
      service,
      venueId,
      staffId,
      userId,
    });
    return { pendingDeductionId, syncedRunId };
  }

  if (pendingDeductionId && pending?.status === "pending") {
    const { error } = await service
      .from("hr_pending_payroll_deductions")
      .update({
        status: "cancelled",
        remaining_amount: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pendingDeductionId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
  }
  return { pendingDeductionId: null, syncedRunId };
}

const updateReplacementSchema = z.object({
  replacementId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(999),
  chargedToEmployee: z.boolean(),
  notes: z.string().trim().max(1000).optional().default(""),
});

export async function updateUniformReplacement(
  input: z.infer<typeof updateReplacementSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = updateReplacementSchema.parse(input);
  const service = createServiceClient();

  const { data: existing, error: loadError } = await service
    .from("hr_uniform_replacements")
    .select(
      `
      id,
      venue_id,
      staff_id,
      piece_id,
      quantity,
      unit_value,
      charged_to_employee,
      deduction_amount,
      notes,
      pending_deduction_id,
      pending_deduction:hr_pending_payroll_deductions!pending_deduction_id(
        id, status, amount, applied_run_id, applied_adjustment_id, reason
      )
    `,
    )
    .eq("id", parsed.replacementId)
    .eq("venue_id", ctx.venue.id)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Replacement query not found.");

  const pending = unwrapPending(
    existing.pending_deduction as
      | PendingDeductionJoin
      | PendingDeductionJoin[]
      | null,
  );

  if (pending?.status === "applied" && pending.applied_run_id) {
    const { data: run, error: runError } = await service
      .from("hr_payroll_runs")
      .select("id, status")
      .eq("id", pending.applied_run_id)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (run && !isPayrollRunMutable(String(run.status))) {
      throw new Error(
        "This deduction is on a locked or paid payroll run and cannot be changed. Reopen that month's payroll first, or add a correction on the next run.",
      );
    }
  }

  const unitValue = Number(existing.unit_value ?? 0);
  const deductionAmount = parsed.chargedToEmployee
    ? Math.round(unitValue * parsed.quantity * 100) / 100
    : 0;
  const notes = parsed.notes?.trim() ?? "";

  const { data: piece } = await service
    .from("hr_uniform_pieces")
    .select("name")
    .eq("id", existing.piece_id)
    .maybeSingle();
  const pieceName = String(piece?.name ?? "Uniform piece");

  // Persist the line first so sibling totals include this update.
  const { error: updateError } = await service
    .from("hr_uniform_replacements")
    .update({
      quantity: parsed.quantity,
      charged_to_employee: parsed.chargedToEmployee,
      deduction_amount: deductionAmount,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.replacementId);

  if (updateError) throw new Error(updateError.message);

  let pendingDeductionId =
    (existing.pending_deduction_id as string | null) ?? null;

  // Shared pending deduction: total = this line + other siblings.
  let nextPendingAmount = deductionAmount;
  if (pendingDeductionId) {
    const siblings = await sumSiblingDeductionAmount(
      service,
      pendingDeductionId,
      parsed.replacementId,
    );
    nextPendingAmount =
      Math.round((siblings + deductionAmount) * 100) / 100;
  }

  const synced = await syncUniformPendingDeduction({
    service,
    venueId: ctx.venue.id,
    staffId: String(existing.staff_id),
    userId: ctx.user.id,
    pendingDeductionId,
    pending,
    nextAmount: nextPendingAmount,
    reason: `Uniform replacement (updated): ${pieceName} × ${parsed.quantity}`,
    createIfMissing: {
      sourceId: parsed.replacementId,
      pieceLabel: pieceName,
    },
  });
  pendingDeductionId = synced.pendingDeductionId;

  // Point this (and only this) row at the pending deduction when newly created.
  if (pendingDeductionId !== existing.pending_deduction_id) {
    const { error: linkError } = await service
      .from("hr_uniform_replacements")
      .update({
        pending_deduction_id: pendingDeductionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.replacementId);
    if (linkError) throw new Error(linkError.message);
  }

  // If we cancelled a shared pending, clear sibling links too.
  if (
    !pendingDeductionId &&
    existing.pending_deduction_id &&
    pending?.status === "applied"
  ) {
    await service
      .from("hr_uniform_replacements")
      .update({
        pending_deduction_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("pending_deduction_id", existing.pending_deduction_id);
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "uniform_replacement.updated",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_replacements",
    entity_id: parsed.replacementId,
    venue_id: ctx.venue.id,
    after: {
      quantity: parsed.quantity,
      chargedToEmployee: parsed.chargedToEmployee,
      deductionAmount,
      notes,
      pendingDeductionId,
      syncedRunId: synced.syncedRunId,
    },
  });

  revalidateUniformPaths();
  revalidatePath("/hr/payroll");
  if (synced.syncedRunId) {
    revalidatePath(`/hr/payroll/${synced.syncedRunId}`);
  }
}

const deleteReplacementSchema = z.object({
  replacementId: z.string().uuid(),
});

export async function deleteUniformReplacement(
  input: z.infer<typeof deleteReplacementSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = deleteReplacementSchema.parse(input);
  const service = createServiceClient();

  const { data: existing, error: loadError } = await service
    .from("hr_uniform_replacements")
    .select(
      `
      id,
      venue_id,
      staff_id,
      piece_id,
      quantity,
      pending_deduction_id,
      pending_deduction:hr_pending_payroll_deductions!pending_deduction_id(
        id, status, amount, applied_run_id, applied_adjustment_id, reason
      )
    `,
    )
    .eq("id", parsed.replacementId)
    .eq("venue_id", ctx.venue.id)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Replacement query not found.");

  const pending = unwrapPending(
    existing.pending_deduction as
      | PendingDeductionJoin
      | PendingDeductionJoin[]
      | null,
  );

  if (pending?.status === "applied" && pending.applied_run_id) {
    const { data: run, error: runError } = await service
      .from("hr_payroll_runs")
      .select("id, status")
      .eq("id", pending.applied_run_id)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (run && !isPayrollRunMutable(String(run.status))) {
      throw new Error(
        "This deduction is on a locked or paid payroll run and cannot be deleted. Reopen that month's payroll first, or add a correction on the next run.",
      );
    }
  }

  const pendingDeductionId =
    (existing.pending_deduction_id as string | null) ?? null;

  // Remaining siblings after this delete (shared pending deduction).
  let remainingAmount = 0;
  if (pendingDeductionId) {
    remainingAmount = await sumSiblingDeductionAmount(
      service,
      pendingDeductionId,
      parsed.replacementId,
    );
  }

  const { data: piece } = await service
    .from("hr_uniform_pieces")
    .select("name")
    .eq("id", existing.piece_id)
    .maybeSingle();
  const pieceName = String(piece?.name ?? "Uniform piece");

  const synced = pendingDeductionId
    ? await syncUniformPendingDeduction({
        service,
        venueId: ctx.venue.id,
        staffId: String(existing.staff_id),
        userId: ctx.user.id,
        pendingDeductionId,
        pending,
        nextAmount: remainingAmount,
        reason:
          remainingAmount > 0
            ? `Uniform replacement (updated after delete)`
            : `Uniform replacement deleted: ${pieceName} × ${existing.quantity}`,
      })
    : { pendingDeductionId: null, syncedRunId: null };

  const { error: deleteError } = await service
    .from("hr_uniform_replacements")
    .delete()
    .eq("id", parsed.replacementId);

  if (deleteError) throw new Error(deleteError.message);

  // Clear sibling links if the shared pending was cancelled.
  if (
    !synced.pendingDeductionId &&
    pendingDeductionId &&
    pending?.status === "applied"
  ) {
    await service
      .from("hr_uniform_replacements")
      .update({
        pending_deduction_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("pending_deduction_id", pendingDeductionId);
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "uniform_replacement.deleted",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_replacements",
    entity_id: parsed.replacementId,
    venue_id: ctx.venue.id,
    after: {
      remainingPendingAmount: remainingAmount,
      syncedRunId: synced.syncedRunId,
    },
  });

  revalidateUniformPaths();
  revalidatePath("/hr/payroll");
  if (synced.syncedRunId) {
    revalidatePath(`/hr/payroll/${synced.syncedRunId}`);
  }
}

const staffIdSchema = z.object({
  staffId: z.string().uuid(),
});

export async function archiveUniformStaff(
  input: z.infer<typeof staffIdSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = staffIdSchema.parse(input);
  const service = createServiceClient();

  await upsertUniformStaffArchive(service, {
    venueId: ctx.venue.id,
    staffId: parsed.staffId,
    archivedBy: ctx.user.id,
  });

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "uniform_staff.archived",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_staff_archives",
    entity_id: parsed.staffId,
    venue_id: ctx.venue.id,
  });

  revalidateUniformPaths();
}

export async function unarchiveUniformStaff(
  input: z.infer<typeof staffIdSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = staffIdSchema.parse(input);
  const service = createServiceClient();

  const { error } = await service
    .from("hr_uniform_staff_archives")
    .delete()
    .eq("venue_id", ctx.venue.id)
    .eq("staff_id", parsed.staffId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "uniform_staff.unarchived",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_staff_archives",
    entity_id: parsed.staffId,
    venue_id: ctx.venue.id,
  });

  revalidateUniformPaths();
}

/** Permanently remove all uniform assignments for a staff member from this view. */
export async function deleteUniformStaffAssignments(
  input: z.infer<typeof staffIdSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = staffIdSchema.parse(input);
  const service = createServiceClient();

  const { data: items, error: itemsError } = await service
    .from("hr_uniform_staff_items")
    .select("id")
    .eq("staff_id", parsed.staffId);
  if (itemsError) throw new Error(itemsError.message);

  if ((items ?? []).length > 0) {
    const { error } = await service
      .from("hr_uniform_staff_items")
      .delete()
      .eq("staff_id", parsed.staffId);
    if (error) throw new Error(error.message);
  }

  // Cancel open replacement deductions that are still pending.
  const { data: replacements } = await service
    .from("hr_uniform_replacements")
    .select("id, pending_deduction_id")
    .eq("venue_id", ctx.venue.id)
    .eq("staff_id", parsed.staffId);

  for (const row of replacements ?? []) {
    if (row.pending_deduction_id) {
      await service
        .from("hr_pending_payroll_deductions")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.pending_deduction_id)
        .eq("status", "pending");
    }
  }

  if ((replacements ?? []).length > 0) {
    // Keep applied payroll history; only remove queries not yet applied.
    const deletableIds = (replacements ?? [])
      .map((row) => row.id as string)
      .filter(Boolean);
    if (deletableIds.length > 0) {
      const { data: pendingLinked } = await service
        .from("hr_uniform_replacements")
        .select(
          "id, pending_deduction:hr_pending_payroll_deductions!pending_deduction_id(status)",
        )
        .in("id", deletableIds);

      const idsToDelete = (pendingLinked ?? [])
        .filter((row) => {
          const pending = Array.isArray(row.pending_deduction)
            ? row.pending_deduction[0]
            : row.pending_deduction;
          return (pending as { status?: string } | null)?.status !== "applied";
        })
        .map((row) => row.id as string);

      if (idsToDelete.length > 0) {
        await service
          .from("hr_uniform_replacements")
          .delete()
          .in("id", idsToDelete);
      }
    }
  }

  await service
    .from("hr_uniform_staff_archives")
    .delete()
    .eq("venue_id", ctx.venue.id)
    .eq("staff_id", parsed.staffId);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "uniform_staff.assignments_deleted",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_staff_items",
    entity_id: parsed.staffId,
    venue_id: ctx.venue.id,
    after: { deletedItemCount: items?.length ?? 0 },
  });

  revalidateUniformPaths();
  revalidatePath("/hr/payroll");
}

function uniformPieceImagePath(pieceId: string) {
  return `${pieceId}.webp`;
}

function legacyUniformPieceImagePaths(pieceId: string) {
  return [`${pieceId}.png`, `${pieceId}.jpg`, `${pieceId}.jpeg`];
}

const LEGACY_UNIFORM_PIECES_BUCKET = "hr-uniform-pieces";

export async function uploadUniformPieceImage(formData: FormData) {
  const ctx = assertEdit(await getActionAuthContext());
  const pieceId = String(formData.get("pieceId") ?? "");
  if (!z.string().uuid().safeParse(pieceId).success) {
    throw new Error("Invalid uniform piece.");
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose an image to upload.");
  }
  if (file.size > UNIFORM_IMAGE_MAX_BYTES) {
    throw new Error("Image must be 2 MB or smaller.");
  }
  if (file.type && !RASTER_IMAGE_TYPES.has(file.type)) {
    throw new Error("Image must be PNG, JPEG, or WebP.");
  }

  const service = createServiceClient();
  const { data: existingPiece, error: loadError } = await service
    .from("hr_uniform_pieces")
    .select("id, name, workdrive_file_id")
    .eq("id", pieceId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existingPiece) throw new Error("Uniform piece not found.");

  const bytes = Buffer.from(await file.arrayBuffer());
  let webp: Awaited<ReturnType<typeof convertImageToWebp>>;
  try {
    webp = await convertImageToWebp(bytes);
  } catch {
    throw new Error("Could not convert image to WebP.");
  }

  const settings = await loadAssetsWorkDriveSettings(service, ctx.venue.id);
  if (!settings.enabled && !settings.clientId) {
    throw new Error(
      "WorkDrive is not configured. Connect Zoho WorkDrive under Settings → Drive config.",
    );
  }

  const previousFileId = String(existingPiece.workdrive_file_id ?? "").trim();
  const uploaded = await uploadUniformPieceImageToWorkDrive({
    venueId: ctx.venue.id,
    settings,
    pieceId,
    pieceName: existingPiece.name,
    bytes: webp.buffer,
    contentType: webp.contentType,
    overrideNameExist: true,
  });

  const imageUrl = uniformPieceWorkDriveDownloadPath(uploaded.workdriveFileId);

  const { error: updateError } = await service
    .from("hr_uniform_pieces")
    .update({
      image_url: imageUrl,
      workdrive_file_id: uploaded.workdriveFileId,
    })
    .eq("id", pieceId);

  if (updateError) throw new Error(updateError.message);

  if (previousFileId && previousFileId !== uploaded.workdriveFileId) {
    try {
      const credentials = credentialsFromSettings(settings);
      const { accessToken, apiDomain } = await ensureAccessToken(
        ctx.venue.id,
        credentials,
      );
      await trashFile(apiDomain, accessToken, previousFileId);
    } catch {
      /* best-effort cleanup */
    }
  }

  await service.storage
    .from(LEGACY_UNIFORM_PIECES_BUCKET)
    .remove([uniformPieceImagePath(pieceId), ...legacyUniformPieceImagePaths(pieceId)]);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_pieces",
    entity_id: pieceId,
    venue_id: ctx.venue.id,
    after: {
      image_url: imageUrl,
      workdrive_file_id: uploaded.workdriveFileId,
      workdrive_path: uploaded.path,
    },
  });

  revalidateUniformPaths();
  return { imageUrl };
}

export async function removeUniformPieceImage(input: { pieceId: string }) {
  const ctx = assertEdit(await getActionAuthContext());
  const pieceId = z.string().uuid().parse(input.pieceId);
  const service = createServiceClient();

  const { data: existingPiece, error: loadError } = await service
    .from("hr_uniform_pieces")
    .select("workdrive_file_id")
    .eq("id", pieceId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);

  const workdriveFileId = String(existingPiece?.workdrive_file_id ?? "").trim();
  if (workdriveFileId) {
    try {
      const settings = await loadAssetsWorkDriveSettings(service, ctx.venue.id);
      const credentials = credentialsFromSettings(settings);
      const { accessToken, apiDomain } = await ensureAccessToken(
        ctx.venue.id,
        credentials,
      );
      await trashFile(apiDomain, accessToken, workdriveFileId);
    } catch {
      /* best-effort cleanup */
    }
  }

  await service.storage
    .from(LEGACY_UNIFORM_PIECES_BUCKET)
    .remove([uniformPieceImagePath(pieceId), ...legacyUniformPieceImagePaths(pieceId)]);

  const { error } = await service
    .from("hr_uniform_pieces")
    .update({ image_url: "", workdrive_file_id: "" })
    .eq("id", pieceId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_pieces",
    entity_id: pieceId,
    venue_id: ctx.venue.id,
    after: { image_url: null, workdrive_file_id: null },
  });

  revalidateUniformPaths();
}
