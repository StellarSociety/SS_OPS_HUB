"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import type { ActionAuthContext, ActionAuthFailure } from "@/lib/auth/action-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { HR_MODULE_KEY } from "@/lib/hr/types";
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
