"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import type { ActionAuthContext, ActionAuthFailure } from "@/lib/auth/action-context";
import { canAccessAssets, canEditAssets } from "@/lib/hr/permissions";
import { listAssetsForStaff } from "@/lib/hr/store";
import { HR_MODULE_KEY, type AssetStatus } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const assetStatusSchema = z.enum(["available", "assigned", "lost", "retired"]);

const createAssetSchema = z.object({
  assetTypeId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  serialNo: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  assetValue: z.coerce.number().min(0).max(999_999_999).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const updateAssetSchema = createAssetSchema.extend({
  assetId: z.string().uuid(),
  status: assetStatusSchema.optional(),
});

const assignAssetSchema = z.object({
  assetId: z.string().uuid(),
  staffId: z.string().uuid(),
  assignedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).optional(),
});

const assetIdSchema = z.object({
  assetId: z.string().uuid(),
});

function revalidateAssetsPath() {
  revalidatePath("/hr/assets");
  revalidatePath("/hr/assets/catalog");
  revalidatePath("/hr/assets/catalog/employees");
  revalidatePath("/hr/assets/catalog/details");
  revalidatePath("/hr/assets/uniform");
  revalidatePath("/hr/assets/uniform/details");
  revalidatePath("/hr/assets/uniform/employees");
  revalidatePath("/hr/payroll");
}

function assertEdit(ctx: ActionAuthContext | ActionAuthFailure): ActionAuthContext {
  if ("error" in ctx) throw new Error(ctx.error);
  if (!canEditAssets(ctx.permissions, ctx.venue.id)) {
    throw new Error("You do not have permission to manage assets.");
  }
  return ctx;
}

export async function createAsset(input: z.infer<typeof createAssetSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = createAssetSchema.parse(input);
  const service = createServiceClient();

  const { data, error } = await service
    .from("hr_assets")
    .insert({
      asset_type_id: parsed.assetTypeId,
      name: parsed.name,
      serial_no: parsed.serialNo ?? "",
      description: parsed.description ?? "",
      asset_value: parsed.assetValue ?? 0,
      notes: parsed.notes ?? "",
      status: "available",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_assets",
    entity_id: data.id,
    venue_id: ctx.venue.id,
    after: parsed,
  });

  revalidateAssetsPath();
  return { id: data.id };
}

export async function updateAsset(input: z.infer<typeof updateAssetSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = updateAssetSchema.parse(input);
  const service = createServiceClient();

  const { data: existing, error: fetchError } = await service
    .from("hr_assets")
    .select("id, status, name, serial_no, description, asset_value, notes, asset_type_id")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Asset not found.");

  const nextStatus = parsed.status ?? (existing.status as AssetStatus);

  if (nextStatus === "assigned") {
    const { data: openAssignment } = await service
      .from("hr_asset_assignments")
      .select("id")
      .eq("asset_id", parsed.assetId)
      .is("returned_at", null)
      .maybeSingle();

    if (!openAssignment) {
      throw new Error(
        "Use Assign to issue this asset to an employee before setting status to Assigned.",
      );
    }
  }

  if (existing.status === "assigned" && nextStatus !== "assigned") {
    const returnedAt = new Date().toISOString().slice(0, 10);
    const { error: closeError } = await service
      .from("hr_asset_assignments")
      .update({ returned_at: returnedAt })
      .eq("asset_id", parsed.assetId)
      .is("returned_at", null);

    if (closeError) throw new Error(closeError.message);
  }

  const { error } = await service
    .from("hr_assets")
    .update({
      asset_type_id: parsed.assetTypeId,
      name: parsed.name,
      serial_no: parsed.serialNo ?? "",
      description: parsed.description ?? "",
      asset_value: parsed.assetValue ?? 0,
      notes: parsed.notes ?? "",
      status: nextStatus,
    })
    .eq("id", parsed.assetId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_assets",
    entity_id: parsed.assetId,
    venue_id: ctx.venue.id,
    before: existing,
    after: parsed,
  });

  revalidateAssetsPath();
}

export async function assignAsset(input: z.infer<typeof assignAssetSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = assignAssetSchema.parse(input);
  const service = createServiceClient();

  const { data: asset, error: assetError } = await service
    .from("hr_assets")
    .select("id, status, name")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) throw new Error(assetError.message);
  if (!asset) throw new Error("Asset not found.");
  if (asset.status !== "available") {
    throw new Error("Only available assets can be assigned.");
  }

  const { data: staff, error: staffError } = await service
    .from("staff")
    .select("id, full_name")
    .eq("id", parsed.staffId)
    .maybeSingle();

  if (staffError) throw new Error(staffError.message);
  if (!staff) throw new Error("Staff member not found.");

  const { data: assignment, error: assignError } = await service
    .from("hr_asset_assignments")
    .insert({
      asset_id: parsed.assetId,
      staff_id: parsed.staffId,
      assigned_at: parsed.assignedAt,
      notes: parsed.notes ?? "",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (assignError) throw new Error(assignError.message);

  const { error: statusError } = await service
    .from("hr_assets")
    .update({ status: "assigned" satisfies AssetStatus })
    .eq("id", parsed.assetId);

  if (statusError) throw new Error(statusError.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_asset_assignments",
    entity_id: assignment.id,
    venue_id: ctx.venue.id,
    after: {
      assetId: parsed.assetId,
      staffId: parsed.staffId,
      staffName: staff.full_name,
      assignedAt: parsed.assignedAt,
    },
  });

  revalidateAssetsPath();
}

export async function returnAsset(input: z.infer<typeof assetIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = assetIdSchema.parse(input);
  const service = createServiceClient();

  const { data: assignment, error: assignmentError } = await service
    .from("hr_asset_assignments")
    .select("id, asset_id, staff_id, assigned_at")
    .eq("asset_id", parsed.assetId)
    .is("returned_at", null)
    .maybeSingle();

  if (assignmentError) throw new Error(assignmentError.message);
  if (!assignment) throw new Error("No active assignment found for this asset.");

  const returnedAt = new Date().toISOString().slice(0, 10);

  const { error: closeError } = await service
    .from("hr_asset_assignments")
    .update({ returned_at: returnedAt })
    .eq("id", assignment.id);

  if (closeError) throw new Error(closeError.message);

  const { error: statusError } = await service
    .from("hr_assets")
    .update({ status: "available" satisfies AssetStatus })
    .eq("id", parsed.assetId);

  if (statusError) throw new Error(statusError.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_asset_assignments",
    entity_id: assignment.id,
    venue_id: ctx.venue.id,
    before: { returned_at: null },
    after: { returned_at: returnedAt },
  });

  revalidateAssetsPath();
}

export async function markAssetLost(input: z.infer<typeof assetIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = assetIdSchema.parse(input);
  const service = createServiceClient();

  const { data: asset, error: assetError } = await service
    .from("hr_assets")
    .select("id, status")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) throw new Error(assetError.message);
  if (!asset) throw new Error("Asset not found.");

  const returnedAt = new Date().toISOString().slice(0, 10);

  const { data: assignment } = await service
    .from("hr_asset_assignments")
    .select("id")
    .eq("asset_id", parsed.assetId)
    .is("returned_at", null)
    .maybeSingle();

  if (assignment) {
    const { error: closeError } = await service
      .from("hr_asset_assignments")
      .update({ returned_at: returnedAt })
      .eq("id", assignment.id);

    if (closeError) throw new Error(closeError.message);
  }

  const { error: statusError } = await service
    .from("hr_assets")
    .update({ status: "lost" satisfies AssetStatus })
    .eq("id", parsed.assetId);

  if (statusError) throw new Error(statusError.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_assets",
    entity_id: parsed.assetId,
    venue_id: ctx.venue.id,
    before: { status: asset.status },
    after: { status: "lost" },
  });

  revalidateAssetsPath();
}

export async function retireAsset(input: z.infer<typeof assetIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = assetIdSchema.parse(input);
  const service = createServiceClient();

  const { data: asset, error: assetError } = await service
    .from("hr_assets")
    .select("id, status")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) throw new Error(assetError.message);
  if (!asset) throw new Error("Asset not found.");
  if (asset.status === "assigned") {
    throw new Error("Return the asset before retiring it.");
  }

  const { error } = await service
    .from("hr_assets")
    .update({ status: "retired" satisfies AssetStatus })
    .eq("id", parsed.assetId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_assets",
    entity_id: parsed.assetId,
    venue_id: ctx.venue.id,
    before: { status: asset.status },
    after: { status: "retired" },
  });

  revalidateAssetsPath();
}

export async function deleteAsset(input: z.infer<typeof assetIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = assetIdSchema.parse(input);
  const service = createServiceClient();

  const { data: asset, error: assetError } = await service
    .from("hr_assets")
    .select("id, status, name")
    .eq("id", parsed.assetId)
    .maybeSingle();

  if (assetError) throw new Error(assetError.message);
  if (!asset) throw new Error("Asset not found.");
  if (asset.status === "assigned") {
    throw new Error("Return the asset before deleting it.");
  }

  const { error: assignmentsError } = await service
    .from("hr_asset_assignments")
    .delete()
    .eq("asset_id", parsed.assetId);

  if (assignmentsError) throw new Error(assignmentsError.message);

  const { error } = await service
    .from("hr_assets")
    .delete()
    .eq("id", parsed.assetId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_assets",
    entity_id: parsed.assetId,
    venue_id: ctx.venue.id,
    before: asset,
    after: { deleted: true },
  });

  revalidateAssetsPath();
}

export async function listStaffAssets(input: { staffId: string }) {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) throw new Error(ctx.error);
  if (!canAccessAssets(ctx.permissions, ctx.venue.id)) {
    throw new Error("You do not have permission to view assets.");
  }

  const service = createServiceClient();
  return listAssetsForStaff(service, input.staffId);
}

const assetTypeNameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const updateAssetTypeSchema = assetTypeNameSchema.extend({
  id: z.string().uuid(),
});

export async function createAssetType(input: z.infer<typeof assetTypeNameSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = assetTypeNameSchema.parse(input);
  const service = createServiceClient();

  const { data: maxRow } = await service
    .from("asset_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = Number(maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await service
    .from("asset_types")
    .insert({ name: parsed.name, sort_order: sortOrder })
    .select("id, name, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("An asset type with that name already exists.");
    }
    throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "asset_types",
    entity_id: data.id,
    venue_id: ctx.venue.id,
    after: data,
  });

  revalidateAssetsPath();
  return data as { id: string; name: string; sort_order: number };
}

export async function updateAssetType(
  input: z.infer<typeof updateAssetTypeSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = updateAssetTypeSchema.parse(input);
  const service = createServiceClient();

  const { data: existing, error: fetchError } = await service
    .from("asset_types")
    .select("id, name, sort_order")
    .eq("id", parsed.id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Asset type not found.");

  const { data, error } = await service
    .from("asset_types")
    .update({ name: parsed.name })
    .eq("id", parsed.id)
    .select("id, name, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("An asset type with that name already exists.");
    }
    throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "asset_types",
    entity_id: parsed.id,
    venue_id: ctx.venue.id,
    before: existing,
    after: data,
  });

  revalidateAssetsPath();
  return data as { id: string; name: string; sort_order: number };
}

export async function deleteAssetType(input: { id: string }) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = z.object({ id: z.string().uuid() }).parse(input);
  const service = createServiceClient();

  const { data: existing, error: fetchError } = await service
    .from("asset_types")
    .select("id, name, sort_order")
    .eq("id", parsed.id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Asset type not found.");

  const { count } = await service
    .from("hr_assets")
    .select("id", { count: "exact", head: true })
    .eq("asset_type_id", parsed.id);

  if ((count ?? 0) > 0) {
    throw new Error(
      "This type is used by existing assets. Reassign or delete those assets first.",
    );
  }

  const { error } = await service
    .from("asset_types")
    .delete()
    .eq("id", parsed.id);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "asset_types",
    entity_id: parsed.id,
    venue_id: ctx.venue.id,
    before: existing,
    after: { deleted: true },
  });

  revalidateAssetsPath();
}

const assignAssetsToStaffSchema = z.object({
  staffId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1),
  assignedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).optional(),
});

export async function assignAssetsToStaff(
  input: z.infer<typeof assignAssetsToStaffSchema>,
) {
  assertEdit(await getActionAuthContext());
  const parsed = assignAssetsToStaffSchema.parse(input);
  const uniqueIds = [...new Set(parsed.assetIds)];

  for (const assetId of uniqueIds) {
    await assignAsset({
      assetId,
      staffId: parsed.staffId,
      assignedAt: parsed.assignedAt,
      notes: parsed.notes,
    });
  }

  return { assigned: uniqueIds.length };
}

const staffIdSchema = z.object({
  staffId: z.string().uuid(),
});

export async function archiveAssetStaff(input: z.infer<typeof staffIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = staffIdSchema.parse(input);
  const service = createServiceClient();

  const { error } = await service.from("hr_asset_staff_archives").upsert(
    {
      venue_id: ctx.venue.id,
      staff_id: parsed.staffId,
      archived_at: new Date().toISOString(),
      archived_by: ctx.user.id,
    },
    { onConflict: "venue_id,staff_id" },
  );

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "asset_staff.archived",
    module_key: HR_MODULE_KEY,
    entity: "hr_asset_staff_archives",
    entity_id: parsed.staffId,
    venue_id: ctx.venue.id,
    after: { staffId: parsed.staffId },
  });

  revalidateAssetsPath();
}

export async function unarchiveAssetStaff(
  input: z.infer<typeof staffIdSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = staffIdSchema.parse(input);
  const service = createServiceClient();

  const { error } = await service
    .from("hr_asset_staff_archives")
    .delete()
    .eq("venue_id", ctx.venue.id)
    .eq("staff_id", parsed.staffId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "asset_staff.unarchived",
    module_key: HR_MODULE_KEY,
    entity: "hr_asset_staff_archives",
    entity_id: parsed.staffId,
    venue_id: ctx.venue.id,
    after: { staffId: parsed.staffId },
  });

  revalidateAssetsPath();
}

export async function deleteAssetStaffAssignments(
  input: z.infer<typeof staffIdSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = staffIdSchema.parse(input);
  const service = createServiceClient();

  const { data: open, error: openError } = await service
    .from("hr_asset_assignments")
    .select("id, asset_id")
    .eq("staff_id", parsed.staffId)
    .is("returned_at", null);

  if (openError) throw new Error(openError.message);

  const returnedAt = new Date().toISOString().slice(0, 10);
  for (const row of open ?? []) {
    const { error: closeError } = await service
      .from("hr_asset_assignments")
      .update({ returned_at: returnedAt })
      .eq("id", row.id);
    if (closeError) throw new Error(closeError.message);

    const { error: statusError } = await service
      .from("hr_assets")
      .update({ status: "available" satisfies AssetStatus })
      .eq("id", row.asset_id);
    if (statusError) throw new Error(statusError.message);
  }

  await service
    .from("hr_asset_staff_archives")
    .delete()
    .eq("venue_id", ctx.venue.id)
    .eq("staff_id", parsed.staffId);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_asset_assignments",
    entity_id: parsed.staffId,
    venue_id: ctx.venue.id,
    after: {
      staffId: parsed.staffId,
      returnedAssignments: (open ?? []).length,
    },
  });

  revalidateAssetsPath();
}

const initiateAssetReplacementSchema = z.object({
  staffId: z.string().uuid(),
  chargedToEmployee: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        assignmentId: z.string().uuid(),
        disposition: z.enum(["returned", "lost"]),
        replacementAssetId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1),
});

export type InitiateAssetReplacementResult = {
  replacementIds: string[];
  pendingDeductionId: string | null;
  deductionAmount: number;
  chargedToEmployee: boolean;
  lines: { name: string; serialNo: string; lineValue: number }[];
};

export async function initiateAssetReplacement(
  input: z.infer<typeof initiateAssetReplacementSchema>,
): Promise<InitiateAssetReplacementResult> {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = initiateAssetReplacementSchema.parse(input);
  const service = createServiceClient();
  const notes = parsed.notes?.trim() ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const assignmentIds = parsed.lines.map((line) => line.assignmentId);
  const { data: assignments, error: assignmentError } = await service
    .from("hr_asset_assignments")
    .select(
      `
      id,
      staff_id,
      asset_id,
      returned_at,
      asset:hr_assets(id, name, serial_no, asset_value, status)
    `,
    )
    .in("id", assignmentIds)
    .eq("staff_id", parsed.staffId);

  if (assignmentError) throw new Error(assignmentError.message);
  if ((assignments ?? []).length !== assignmentIds.length) {
    throw new Error("One or more selected asset assignments were not found.");
  }

  type ResolvedLine = {
    assignmentId: string;
    assetId: string;
    assetName: string;
    serialNo: string;
    unitValue: number;
    disposition: "returned" | "lost";
    replacementAssetId: string | null;
    lineValue: number;
  };

  const resolvedLines: ResolvedLine[] = [];
  const usedReplacementIds = new Set<string>();

  for (const line of parsed.lines) {
    const row = (assignments ?? []).find((a) => a.id === line.assignmentId);
    if (!row || row.returned_at) {
      throw new Error("Selected assignment is no longer open.");
    }
    const assetRaw = row.asset as
      | {
          id: string;
          name: string;
          serial_no: string;
          asset_value: number | string;
          status: string;
        }
      | {
          id: string;
          name: string;
          serial_no: string;
          asset_value: number | string;
          status: string;
        }[]
      | null;
    const asset = Array.isArray(assetRaw) ? assetRaw[0] : assetRaw;
    if (!asset) throw new Error("Asset not found for assignment.");

    let replacementAssetId = line.replacementAssetId ?? null;
    if (replacementAssetId) {
      if (usedReplacementIds.has(replacementAssetId)) {
        throw new Error("Each replacement asset can only be used once.");
      }
      if (replacementAssetId === asset.id) {
        throw new Error(
          "Replacement asset must be different from the original.",
        );
      }
      const { data: replacement, error: replacementError } = await service
        .from("hr_assets")
        .select("id, status, name")
        .eq("id", replacementAssetId)
        .maybeSingle();
      if (replacementError) throw new Error(replacementError.message);
      if (!replacement || replacement.status !== "available") {
        throw new Error(
          `Replacement asset ${replacement?.name ?? replacementAssetId} is not available.`,
        );
      }
      usedReplacementIds.add(replacementAssetId);
    }

    const unitValue = Number(asset.asset_value ?? 0);
    resolvedLines.push({
      assignmentId: line.assignmentId,
      assetId: asset.id,
      assetName: asset.name,
      serialNo: asset.serial_no ?? "",
      unitValue,
      disposition: line.disposition,
      replacementAssetId,
      lineValue: unitValue,
    });
  }

  const deductionAmount = parsed.chargedToEmployee
    ? Math.round(
        resolvedLines.reduce((sum, line) => sum + line.lineValue, 0) * 100,
      ) / 100
    : 0;

  for (const line of resolvedLines) {
    const { error: closeError } = await service
      .from("hr_asset_assignments")
      .update({ returned_at: today })
      .eq("id", line.assignmentId);
    if (closeError) throw new Error(closeError.message);

    const nextStatus: AssetStatus =
      line.disposition === "lost" ? "lost" : "available";
    const { error: statusError } = await service
      .from("hr_assets")
      .update({ status: nextStatus })
      .eq("id", line.assetId);
    if (statusError) throw new Error(statusError.message);

    if (line.replacementAssetId) {
      const { error: assignError } = await service
        .from("hr_asset_assignments")
        .insert({
          asset_id: line.replacementAssetId,
          staff_id: parsed.staffId,
          assigned_at: today,
          notes:
            notes ||
            `Replacement for ${line.assetName}${parsed.chargedToEmployee ? " (employee-charged)" : ""}`,
          created_by: ctx.user.id,
        });
      if (assignError) throw new Error(assignError.message);

      const { error: replaceStatusError } = await service
        .from("hr_assets")
        .update({ status: "assigned" satisfies AssetStatus })
        .eq("id", line.replacementAssetId);
      if (replaceStatusError) throw new Error(replaceStatusError.message);
    }
  }

  let pendingDeductionId: string | null = null;
  if (parsed.chargedToEmployee && deductionAmount > 0) {
    const summary = resolvedLines
      .map((line) =>
        line.serialNo
          ? `${line.assetName} (${line.serialNo})`
          : line.assetName,
      )
      .join(", ");
    const { data: pending, error: pendingError } = await service
      .from("hr_pending_payroll_deductions")
      .insert({
        venue_id: ctx.venue.id,
        staff_id: parsed.staffId,
        category: "deduction",
        code: "ASSET",
        label: "Asset / equipment",
        amount: deductionAmount,
        original_amount: deductionAmount,
        remaining_amount: deductionAmount,
        reason: `Asset replacement: ${summary}`,
        source: "asset_replacement",
        status: "pending",
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (pendingError) throw new Error(pendingError.message);
    pendingDeductionId = pending.id as string;
  }

  const { data: replacements, error: replacementError } = await service
    .from("hr_asset_replacements")
    .insert(
      resolvedLines.map((line) => ({
        venue_id: ctx.venue.id,
        staff_id: parsed.staffId,
        asset_id: line.assetId,
        assignment_id: line.assignmentId,
        replacement_asset_id: line.replacementAssetId,
        disposition: line.disposition,
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

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "asset_replacement.created",
    module_key: HR_MODULE_KEY,
    entity: "hr_asset_replacements",
    entity_id: replacementIds[0] ?? parsed.staffId,
    venue_id: ctx.venue.id,
    after: {
      staffId: parsed.staffId,
      chargedToEmployee: parsed.chargedToEmployee,
      deductionAmount,
      pendingDeductionId,
      replacementIds,
      lines: resolvedLines.map((line) => ({
        assetId: line.assetId,
        disposition: line.disposition,
        replacementAssetId: line.replacementAssetId,
        lineValue: line.lineValue,
      })),
    },
  });

  revalidateAssetsPath();

  return {
    replacementIds,
    pendingDeductionId,
    deductionAmount,
    chargedToEmployee: parsed.chargedToEmployee,
    lines: resolvedLines.map((line) => ({
      name: line.assetName,
      serialNo: line.serialNo,
      lineValue: line.lineValue,
    })),
  };
}

export async function deleteAssetReplacement(input: {
  replacementId: string;
}) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = z.object({ replacementId: z.string().uuid() }).parse(input);
  const service = createServiceClient();

  const { data: row, error } = await service
    .from("hr_asset_replacements")
    .select(
      `
      id,
      venue_id,
      staff_id,
      charged_to_employee,
      deduction_amount,
      pending_deduction_id,
      pending_deduction:hr_pending_payroll_deductions!pending_deduction_id(status)
    `,
    )
    .eq("id", parsed.replacementId)
    .eq("venue_id", ctx.venue.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Replacement record not found.");

  const pendingRaw = row.pending_deduction as
    | { status: string }
    | { status: string }[]
    | null;
  const pending = Array.isArray(pendingRaw) ? pendingRaw[0] : pendingRaw;
  if (pending?.status === "applied" || pending?.status === "cleared") {
    throw new Error(
      "This replacement deduction is already on payroll and cannot be deleted.",
    );
  }

  if (row.pending_deduction_id) {
    const { data: siblings } = await service
      .from("hr_asset_replacements")
      .select("id")
      .eq("pending_deduction_id", row.pending_deduction_id)
      .neq("id", parsed.replacementId);

    if ((siblings ?? []).length === 0) {
      await service
        .from("hr_pending_payroll_deductions")
        .update({ status: "cancelled" })
        .eq("id", row.pending_deduction_id)
        .eq("status", "pending");
    }
  }

  const { error: deleteError } = await service
    .from("hr_asset_replacements")
    .delete()
    .eq("id", parsed.replacementId);

  if (deleteError) throw new Error(deleteError.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_asset_replacements",
    entity_id: parsed.replacementId,
    venue_id: ctx.venue.id,
    before: row,
    after: { deleted: true },
  });

  revalidateAssetsPath();
}
