"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { canEditOwnStaff, canViewStaff } from "@/lib/hr/permissions";
import { HR_MODULE_KEY } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type StaffPathNoteItem = {
  id: string;
  noteDate: string;
  body: string;
  createdAt: string;
};

function mapNote(row: Record<string, unknown>): StaffPathNoteItem {
  return {
    id: row.id as string,
    noteDate: String(row.note_date).slice(0, 10),
    body: String(row.body ?? ""),
    createdAt: row.created_at as string,
  };
}

async function requireEditableStaff(staffId: string) {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  const { supabase, user, venue, permissions } = ctx;

  const { data: staff, error } = await supabase
    .from("staff")
    .select("id, created_by")
    .eq("id", staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();
  if (error || !staff) return { error: error?.message ?? "Staff not found." } as const;

  if (
    !canEditOwnStaff(
      permissions,
      venue.id,
      (staff.created_by as string | null) ?? null,
      user.id,
    )
  ) {
    return { error: "You do not have permission to edit staff." } as const;
  }
  return { user, venue } as const;
}

export async function listStaffPathNotes(
  staffId: string,
): Promise<{ ok: true; items: StaffPathNoteItem[] } | { ok: false; error: string }> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { venue, permissions } = ctx;
  if (!canViewStaff(permissions, venue.id)) {
    return { ok: false, error: "No permission to view staff notes." };
  }

  // Service role, same as position/salary history: per-row RLS checks are slow.
  const { data, error } = await createServiceClient()
    .from("hr_staff_path_notes")
    .select("id, note_date, body, created_at")
    .eq("venue_id", venue.id)
    .eq("staff_id", staffId.trim())
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []).map((r) => mapNote(r)) };
}

export async function createStaffPathNote(input: {
  staffId: string;
  noteDate: string;
  body: string;
}): Promise<{ ok: true; item: StaffPathNoteItem } | { ok: false; error: string }> {
  const staffId = input.staffId.trim();
  const noteDate = /^\d{4}-\d{2}-\d{2}$/.exec(input.noteDate.trim())?.[0];
  const body = input.body.trim();
  if (!staffId) return { ok: false, error: "Staff member is required." };
  if (!noteDate) return { ok: false, error: "Choose a date." };
  if (!body) return { ok: false, error: "Write a note." };

  const auth = await requireEditableStaff(staffId);
  if ("error" in auth) return { ok: false, error: auth.error ?? "Not allowed." };
  const { user, venue } = auth;

  const { data, error } = await createServiceClient()
    .from("hr_staff_path_notes")
    .insert({
      venue_id: venue.id,
      staff_id: staffId,
      note_date: noteDate,
      body,
      created_by: user.id,
    })
    .select("id, note_date, body, created_at")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not save note." };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "staff_path_note",
    entity_id: data.id as string,
    venue_id: venue.id,
    after: { staff_id: staffId, note_date: noteDate, body },
  });
  revalidatePath(`/hr/${staffId}`);

  return { ok: true, item: mapNote(data) };
}

export async function updateStaffPathNote(input: {
  staffId: string;
  noteId: string;
  noteDate: string;
  body: string;
}): Promise<{ ok: true; item: StaffPathNoteItem } | { ok: false; error: string }> {
  const staffId = input.staffId.trim();
  const noteId = input.noteId.trim();
  const noteDate = /^\d{4}-\d{2}-\d{2}$/.exec(input.noteDate.trim())?.[0];
  const body = input.body.trim();
  if (!staffId || !noteId) return { ok: false, error: "Note is required." };
  if (!noteDate) return { ok: false, error: "Choose a date." };
  if (!body) return { ok: false, error: "Write a note." };

  const auth = await requireEditableStaff(staffId);
  if ("error" in auth) return { ok: false, error: auth.error ?? "Not allowed." };
  const { user, venue } = auth;

  const service = createServiceClient();
  const { data: before } = await service
    .from("hr_staff_path_notes")
    .select("note_date, body")
    .eq("id", noteId)
    .eq("venue_id", venue.id)
    .eq("staff_id", staffId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Note not found." };

  const { data, error } = await service
    .from("hr_staff_path_notes")
    .update({ note_date: noteDate, body })
    .eq("id", noteId)
    .eq("venue_id", venue.id)
    .eq("staff_id", staffId)
    .select("id, note_date, body, created_at")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not update note." };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "staff_path_note",
    entity_id: noteId,
    venue_id: venue.id,
    before,
    after: { note_date: noteDate, body },
  });
  revalidatePath(`/hr/${staffId}`);

  return { ok: true, item: mapNote(data) };
}

export async function deleteStaffPathNote(input: {
  staffId: string;
  noteId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staffId = input.staffId.trim();
  const noteId = input.noteId.trim();
  if (!staffId || !noteId) return { ok: false, error: "Note is required." };

  const auth = await requireEditableStaff(staffId);
  if ("error" in auth) return { ok: false, error: auth.error ?? "Not allowed." };
  const { user, venue } = auth;

  const { data: existing, error } = await createServiceClient()
    .from("hr_staff_path_notes")
    .delete()
    .eq("id", noteId)
    .eq("venue_id", venue.id)
    .eq("staff_id", staffId)
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!existing) return { ok: false, error: "Note not found." };

  await writeAuditLog({
    actor_id: user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "staff_path_note",
    entity_id: noteId,
    venue_id: venue.id,
    before: existing,
  });
  revalidatePath(`/hr/${staffId}`);

  return { ok: true };
}
