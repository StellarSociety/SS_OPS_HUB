"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { listVenueAppUsers } from "@/lib/connect/store";
import { canAccessDirectoryStaff } from "@/lib/directory/permissions";
import { loadDirectoryStaff } from "@/lib/directory/store";
import type { DirectoryStaffMember } from "@/lib/directory/types";
import type { UserPermission } from "@/lib/role-permissions";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Which directory staff can be messaged: staff id → their Hub login, for
 * logins on this venue's app. A staff record matches the profile linked to
 * it, or (when not linked) the profile with its work / personal email — the
 * same fallback Connecteam uses for contact details.
 */
export async function loadDirectoryChatUsers(input: {
  venueId: string;
  staffIds: string[];
}): Promise<{ ok: true; meId: string; byStaff: Record<string, string> } | { ok: false }> {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return { ok: false };
  const staffIds = [...new Set(input.staffIds)].slice(0, 2000);
  if (staffIds.length === 0) return { ok: true, meId: access.userId, byStaff: {} };

  const service = createServiceClient();
  const audience = new Set(
    (await listVenueAppUsers(service, access.venueId)).map((person) => person.userId),
  );
  if (audience.size === 0) return { ok: true, meId: access.userId, byStaff: {} };

  const [{ data: profiles }, { data: staffRows }] = await Promise.all([
    service.from("profiles").select("id, staff_id, email").in("id", [...audience]),
    service.from("staff").select("id, work_email, personal_email").in("id", staffIds),
  ]);

  const byStaff: Record<string, string> = {};
  const byEmail = new Map<string, string>();
  for (const profile of profiles ?? []) {
    const id = String(profile.id);
    if (profile.staff_id) byStaff[String(profile.staff_id)] = id;
    const email = String(profile.email ?? "").trim().toLowerCase();
    if (email) byEmail.set(email, id);
  }
  for (const staff of staffRows ?? []) {
    const staffId = String(staff.id);
    if (byStaff[staffId]) continue;
    for (const raw of [staff.work_email, staff.personal_email]) {
      const match = byEmail.get(String(raw ?? "").trim().toLowerCase());
      if (match) {
        byStaff[staffId] = match;
        break;
      }
    }
  }
  // Only the staff that were asked about.
  const wanted = new Set(staffIds);
  for (const key of Object.keys(byStaff)) if (!wanted.has(key)) delete byStaff[key];
  return { ok: true, meId: access.userId, byStaff };
}

/**
 * Directory details for the person behind a Hub login — the same record the
 * Directory app shows. Only for viewers allowed to see Directory staff; others
 * get `member: null` and the card keeps to name, position and department.
 */
export async function loadPersonDirectoryDetails(
  userId: string,
): Promise<{ ok: true; member: DirectoryStaffMember | null } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!userId) return { ok: true, member: null };
  if (!canAccessDirectoryStaff(auth.permissions as UserPermission[], auth.venue.id)) {
    return { ok: true, member: null };
  }

  const service = createServiceClient();
  const [{ data: profile }, staff] = await Promise.all([
    service.from("profiles").select("staff_id, email").eq("id", userId).maybeSingle(),
    loadDirectoryStaff(auth.supabase, auth.venue),
  ]);
  if (!profile) return { ok: true, member: null };

  const email = String(profile.email ?? "").trim().toLowerCase();
  const member =
    (profile.staff_id ? staff.find((m) => m.id === String(profile.staff_id)) : undefined) ??
    (email
      ? staff.find(
          (m) =>
            m.workEmail?.trim().toLowerCase() === email ||
            m.personalEmail?.trim().toLowerCase() === email,
        )
      : undefined) ??
    null;
  return { ok: true, member };
}
