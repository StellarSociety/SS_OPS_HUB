import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccessEventRow,
  InviteableStaffRow,
  ModuleAccessRecord,
  UserListRow,
} from "./types";

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

/** Resolve login email for a chosen source, falling back sensibly. */
export function resolveLoginEmail(
  source: "work" | "personal" | "custom",
  staff: { work_email: string | null; personal_email: string | null },
  custom?: string | null,
): string | null {
  if (source === "custom") return custom?.trim() || null;
  if (source === "work") return staff.work_email?.trim() || null;
  if (source === "personal") return staff.personal_email?.trim() || null;
  return staffInviteEmail(staff);
}

/** Loads per-user module access; tolerant of the table not existing yet. */
async function loadModuleAccess(
  supabase: SupabaseClient,
): Promise<Map<string, ModuleAccessRecord[]>> {
  const byUser = new Map<string, ModuleAccessRecord[]>();
  try {
    const { data, error } = await supabase
      .from("user_module_access")
      .select("id, user_id, venue_id, module_key, role, enabled, suspended");
    if (error) return byUser;
    for (const row of data ?? []) {
      const list = byUser.get(row.user_id) ?? [];
      list.push({
        id: row.id,
        venue_id: row.venue_id,
        module_key: row.module_key,
        role: row.role,
        enabled: row.enabled,
        suspended: row.suspended,
      });
      byUser.set(row.user_id, list);
    }
  } catch {
    // table not migrated yet — treat as no module access
  }
  return byUser;
}

const STAFF_JOIN = `
      staff:staff_id (
        id,
        emp_no,
        first_name,
        full_name,
        work_email,
        personal_email,
        home_venue_id,
        department:department_id ( name ),
        position:position_id ( name ),
        employment_status:employment_status_id ( name ),
        home_venue:home_venue_id ( id, name, slug, is_global )
      )`;

const PROFILE_SELECT_EXT = `
      id, email, full_name, status, staff_id,
      is_external, login_email_source, invited_at, invite_accepted_at, last_login_at,
      created_at,${STAFF_JOIN}`;

const PROFILE_SELECT_BASE = `
      id, email, full_name, status, staff_id, created_at,${STAFF_JOIN}`;

type RawNamed = { name: string } | { name: string }[] | null;
type RawStaff = {
  id: string;
  emp_no: string;
  first_name: string | null;
  full_name: string;
  work_email: string | null;
  personal_email: string | null;
  home_venue_id: string;
  department: RawNamed;
  position: RawNamed;
  employment_status: RawNamed;
  home_venue:
    | { id: string; name: string; slug: string; is_global: boolean }
    | { id: string; name: string; slug: string; is_global: boolean }[]
    | null;
};
type RawProfile = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  staff_id: string | null;
  created_at: string;
  is_external?: boolean | null;
  login_email_source?: "work" | "personal" | "custom" | null;
  invited_at?: string | null;
  invite_accepted_at?: string | null;
  last_login_at?: string | null;
  staff?: RawStaff | RawStaff[] | null;
};

export async function listUsers(
  supabase: SupabaseClient,
): Promise<UserListRow[]> {
  // Try the extended select (post-migration); fall back gracefully if the new
  // profile columns don't exist yet.
  let profiles: RawProfile[] = [];
  const extended = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_EXT)
    .order("full_name", { ascending: true });

  if (extended.error) {
    const base = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_BASE)
      .order("full_name", { ascending: true });
    if (base.error) throw base.error;
    profiles = (base.data ?? []) as unknown as RawProfile[];
  } else {
    profiles = (extended.data ?? []) as unknown as RawProfile[];
  }

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

  const moduleAccessByUser = await loadModuleAccess(supabase);

  return profiles.map((p) => {
    const staffRaw = unwrapOne(p.staff);
    const staff = staffRaw
      ? {
          ...staffRaw,
          department: unwrapOne(staffRaw.department),
          position: unwrapOne(staffRaw.position),
          employment_status: unwrapOne(staffRaw.employment_status),
          home_venue: unwrapOne(staffRaw.home_venue),
        }
      : null;

    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      status: p.status as UserListRow["status"],
      staff_id: p.staff_id,
      is_external: p.is_external ?? false,
      login_email_source: p.login_email_source ?? null,
      invited_at: p.invited_at ?? null,
      invite_accepted_at: p.invite_accepted_at ?? null,
      last_login_at: p.last_login_at ?? null,
      created_at: p.created_at,
      staff,
      permissions: permsByUser.get(p.id) ?? [],
      moduleAccess: moduleAccessByUser.get(p.id) ?? [],
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
      first_name,
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

export async function listAccessEvents(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<AccessEventRow[]> {
  try {
    const { data, error } = await supabase
      .from("access_events")
      .select("id, user_id, venue_id, module_key, path, event_type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as AccessEventRow[];
  } catch {
    return [];
  }
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
  const modules = new Set(
    permissions.map((p) => p.module_key).filter((m) => m !== "app"),
  );
  if (modules.size === 0) return "—";
  return [...modules].sort().join(", ");
}
