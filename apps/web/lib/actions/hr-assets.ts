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
  revalidatePath("/hr/assets/uniform");
  revalidatePath("/hr/assets/uniform/details");
  revalidatePath("/hr/assets/uniform/employees");
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
