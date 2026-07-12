import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getHrExpiryItems,
  toHrExpiryWidgetItems,
} from "@/lib/notifications/rules/hr-expiry";
// Sensitive columns (salary, passport, EID, bank, etc.) are not protected at the DB
// column level. Reads must stay server-side and be gated by hr/salary before any
// client payload; never select those fields into a client response without that grant.
import {
  DEFAULT_EXPIRY_LEAD_DAYS,
  type ExpiryItem,
  type StaffWithLookups,
} from "./types";

const STAFF_SELECT = `
  *,
  department:departments(id, venue_id, name, sort_order),
  position:positions(id, venue_id, department_id, name, sort_order),
  employment_status:employment_statuses(id, name, sort_order),
  nationality:nationalities(id, name, fly_home_ticket_value)
`;

export async function listStaffForVenue(
  supabase: SupabaseClient,
  homeVenueId: string,
  filters?: { departmentId?: string; statusId?: string; search?: string },
) {
  let query = supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("home_venue_id", homeVenueId)
    .order("emp_no");

  if (filters?.departmentId) {
    query = query.eq("department_id", filters.departmentId);
  }
  if (filters?.statusId) {
    query = query.eq("employment_status_id", filters.statusId);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as StaffWithLookups[];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.emp_no.toLowerCase().includes(q) ||
        (s.work_email?.toLowerCase().includes(q) ?? false) ||
        (s.personal_email?.toLowerCase().includes(q) ?? false),
    );
  }

  return rows;
}

export async function getStaffById(
  supabase: SupabaseClient,
  staffId: string,
  homeVenueId: string,
) {
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id", staffId)
    .eq("home_venue_id", homeVenueId)
    .single();

  if (error) throw error;
  return data as StaffWithLookups;
}

export async function listDepartments(
  supabase: SupabaseClient,
  venueId: string,
) {
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listPositions(
  supabase: SupabaseClient,
  venueId: string,
  departmentId?: string,
) {
  let query = supabase
    .from("positions")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order");
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listEmploymentStatuses(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("employment_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listNationalities(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("nationalities")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listCivilStatuses(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("civil_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listGenders(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("genders")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listInsuranceCategories(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("insurance_categories")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listCertificationTypes(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("certification_types")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

/** Load a single venue HR setting JSON, merged over the provided defaults. */
export async function getHrVenueSetting<T>(
  supabase: SupabaseClient,
  venueId: string,
  key: string,
  defaults: T,
): Promise<T> {
  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return defaults;
  return { ...defaults, ...(data.value as Partial<T>) };
}

export async function getExpiryItems(
  supabase: SupabaseClient,
  homeVenueId: string,
  leadDays = DEFAULT_EXPIRY_LEAD_DAYS,
  options?: { allVenues?: boolean },
): Promise<ExpiryItem[]> {
  const items = await getHrExpiryItems(supabase, homeVenueId, leadDays, options);
  return toHrExpiryWidgetItems(items);
}

export function resolveLookupId<T extends { id: string; name: string }>(
  items: T[],
  name: string | undefined,
): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().toLowerCase();
  const match = items.find((i) => i.name.toLowerCase() === normalized);
  return match?.id ?? null;
}

export function resolvePositionId(
  positions: { id: string; name: string; department_id: string }[],
  departmentId: string | null,
  name: string | undefined,
): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().toLowerCase();
  const pool = departmentId
    ? positions.filter((p) => p.department_id === departmentId)
    : positions;
  const match = pool.find((p) => p.name.toLowerCase() === normalized);
  return match?.id ?? null;
}
