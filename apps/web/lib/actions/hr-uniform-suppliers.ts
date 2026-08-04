"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import type { ActionAuthContext, ActionAuthFailure } from "@/lib/auth/action-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { HR_MODULE_KEY } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ordersEmail: z
    .string()
    .trim()
    .max(254)
    .optional()
    .refine(
      (value) => !value || z.string().email().safeParse(value).success,
      "Enter a valid orders email.",
    ),
  contactPerson: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const updateSupplierSchema = supplierSchema.extend({
  supplierId: z.string().uuid(),
});

const supplierIdSchema = z.object({
  supplierId: z.string().uuid(),
});

function revalidateSupplierPaths() {
  revalidatePath("/hr/assets/uniform/suppliers");
  revalidatePath("/hr/assets/uniform/details");
}

function assertEdit(ctx: ActionAuthContext | ActionAuthFailure): ActionAuthContext {
  if ("error" in ctx) throw new Error(ctx.error);
  if (!canEditAssets(ctx.permissions, ctx.venue.id)) {
    throw new Error("You do not have permission to manage uniform suppliers.");
  }
  return ctx;
}

export async function createUniformSupplier(input: z.infer<typeof supplierSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = supplierSchema.parse(input);
  const service = createServiceClient();

  const { data, error } = await service
    .from("hr_uniform_suppliers")
    .insert({
      name: parsed.name,
      orders_email: parsed.ordersEmail ?? "",
      contact_person: parsed.contactPerson ?? "",
      contact_phone: parsed.contactPhone ?? "",
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
    entity: "hr_uniform_suppliers",
    entity_id: data.id,
    venue_id: ctx.venue.id,
    after: parsed,
  });

  revalidateSupplierPaths();
  return { id: data.id };
}

export async function updateUniformSupplier(
  input: z.infer<typeof updateSupplierSchema>,
) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = updateSupplierSchema.parse(input);
  const service = createServiceClient();

  const { error } = await service
    .from("hr_uniform_suppliers")
    .update({
      name: parsed.name,
      orders_email: parsed.ordersEmail ?? "",
      contact_person: parsed.contactPerson ?? "",
      contact_phone: parsed.contactPhone ?? "",
      notes: parsed.notes ?? "",
    })
    .eq("id", parsed.supplierId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_suppliers",
    entity_id: parsed.supplierId,
    venue_id: ctx.venue.id,
    after: parsed,
  });

  revalidateSupplierPaths();
}

export async function deleteUniformSupplier(input: z.infer<typeof supplierIdSchema>) {
  const ctx = assertEdit(await getActionAuthContext());
  const parsed = supplierIdSchema.parse(input);
  const service = createServiceClient();

  const { count, error: countError } = await service
    .from("hr_uniform_pieces")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", parsed.supplierId);

  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error("Remove supplier links from uniform pieces before deleting.");
  }

  const { error } = await service
    .from("hr_uniform_suppliers")
    .delete()
    .eq("id", parsed.supplierId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_uniform_suppliers",
    entity_id: parsed.supplierId,
    venue_id: ctx.venue.id,
  });

  revalidateSupplierPaths();
}
