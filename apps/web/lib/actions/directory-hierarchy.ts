"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  canAccessDirectoryHierarchyManagement,
  canEditDirectoryHierarchy,
} from "@/lib/directory/permissions";
import {
  hierarchyHirePayload,
  hierarchyPayload,
} from "@/lib/directory/store";
import { DIRECTORY_MODULE_KEY } from "@/lib/directory/types";
import type { HierarchyNode } from "@/lib/directory/hierarchy-tree";

function fail(message: string) {
  return { ok: false as const, error: message };
}

function revalidateHierarchy(slug: string) {
  revalidatePath("/directory/hierarchy", "page");
  revalidatePath("/directory/hierarchy-management", "page");
  revalidatePath("/mobile", "page");
  revalidatePath(`/m/${slug}/directory/hierarchy`, "page");
}

export async function saveDirectoryHierarchyAction(
  roots: HierarchyNode[],
  options?: { persistHires?: boolean },
) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (auth.venue.is_global) {
    return fail("Open Hierarchy from a venue, not Global.");
  }
  const canWrite =
    canEditDirectoryHierarchy(auth.permissions, auth.venue.id) ||
    canAccessDirectoryHierarchyManagement(auth.permissions, auth.venue.id);
  if (!canWrite) {
    return fail("You need Hierarchy editor or Hierarchy Management access.");
  }

  const persistHires = Boolean(options?.persistHires);
  const payload = hierarchyPayload(roots);
  const hires = persistHires ? hierarchyHirePayload(roots) : [];
  const { error } = await auth.supabase.rpc("replace_directory_hierarchy", {
    p_venue_id: auth.venue.id,
    p_nodes: payload,
  });

  if (error) {
    console.error("[directory] saveDirectoryHierarchy:", error.message);
    return fail(error.message || "Could not save the reporting tree.");
  }

  if (persistHires) {
    const { error: hireError } = await auth.supabase.rpc(
      "replace_directory_hierarchy_hires",
      {
        p_venue_id: auth.venue.id,
        p_hires: hires,
      },
    );

    if (hireError) {
      console.error("[directory] saveDirectoryHierarchy hires:", hireError.message);
      return fail(hireError.message || "Could not save hire cards.");
    }
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "directory.hierarchy.save",
    module_key: DIRECTORY_MODULE_KEY,
    entity: "directory_hierarchy_charts",
    entity_id: auth.venue.id,
    venue_id: auth.venue.id,
    after: { nodeCount: payload.length, hireCount: persistHires ? hires.length : undefined },
  });

  revalidateHierarchy(auth.venue.slug);
  return { ok: true as const };
}
