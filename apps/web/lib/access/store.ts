import type { SupabaseClient } from "@supabase/supabase-js";
import type { InviteableStaffRow, UserListRow } from "./types";

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function staffInviteEmail(staff: {
  work_email: string | null;
  personal_email: string | null;
}): string | null {
  return staff.work_email?.trim() || staff.personal_email?.trim() || null;
}

export async function listUsers(
  supabase: SupabaseClient,
): Promise<UserListRow[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(
      `
      id,
      email,
      full_name,
      status,
      staff_id,
      created_at,
      staff:staff_id (
        id,
        emp_no,
        full_name,
        home_venue_id,
        department:department_id ( name ),
        position:position_id ( name ),
        home_venue:home_venue_id ( id, name, slug, is_global )
      )
    `,
    )
    .order("full_name", { ascending: true });

  if (error) throw error;

  const { data: permissions, error: permError } = await supabase
    .from("user_permissions")
    .select("id, user_id, venue_id, module_key, feature_key, access_level");

  if (permError) throw permError;

  const permsByUser = new Map<string, UserListRow["permissions"]>();
  for (const p of permissions ?? []) {
    const list = permsByUser.get(p.user_id) ?? [];
    list.push(p);
    permsByUser.set(p.user_id, list);
  }

  return (profiles ?? []).map((p) => {
    const staffRaw = unwrapOne(p.staff);
    const staff = staffRaw
      ? {
          ...staffRaw,
          department: unwrapOne(staffRaw.department),
          position: unwrapOne(staffRaw.position),
          home_venue: unwrapOne(staffRaw.home_venue),
        }
      : null;

    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      status: p.status as UserListRow["status"],
      staff_id: p.staff_id,
      created_at: p.created_at,
      staff,
      permissions: permsByUser.get(p.id) ?? [],
    } satisfies UserListRow;
  });
}

export async function getUserById(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserListRow | null> {
  const users = await listUsers(supabase);
  return users.find((u) => u.id === userId) ?? null;
}

export async function listInviteableStaff(
  supabase: SupabaseClient,
): Promise<InviteableStaffRow[]> {
  const { data: linked, error: linkedError } = await supabase
    .from("profiles")
    .select("staff_id")
    .not("staff_id", "is", null);

  if (linkedError) throw linkedError;

  const linkedIds = new Set(
    (linked ?? [])
      .map((p) => p.staff_id)
      .filter((id): id is string => Boolean(id)),
  );

  const { data, error } = await supabase
    .from("staff")
    .select(
      `
      id,
      emp_no,
      full_name,
      work_email,
      personal_email,
      home_venue_id,
      home_venue:home_venue_id ( id, name, slug, is_global ),
      department:department_id ( name ),
      position:position_id ( name )
    `,
    )
    .order("full_name", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => !linkedIds.has(row.id))
    .map((row) => ({
      ...row,
      home_venue: unwrapOne(row.home_venue),
      department: unwrapOne(row.department),
      position: unwrapOne(row.position),
    })) as InviteableStaffRow[];
}

export async function listVenues(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listVenueModules(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("venue_modules")
    .select("*")
    .order("module_key", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function summarizePermissionVenues(
  permissions: UserListRow["permissions"],
  venueNames: Map<string, string>,
): string {
  const venueIds = new Set<string | null>();
  for (const p of permissions) {
    venueIds.add(p.venue_id);
  }

  if (venueIds.size === 0) return "No access";
  if (venueIds.has(null) && venueIds.size === 1) return "All venues";
  if (venueIds.has(null)) return "All venues + specific";

  const names = [...venueIds]
    .filter((id): id is string => id !== null)
    .map((id) => venueNames.get(id) ?? "Unknown")
    .sort();

  return names.join(", ");
}

export function summarizePermissionModules(
  permissions: UserListRow["permissions"],
): string {
  const modules = new Set(permissions.map((p) => p.module_key));
  if (modules.size === 0) return "—";
  return [...modules].sort().join(", ");
}
