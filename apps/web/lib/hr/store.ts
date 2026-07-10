import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, daysUntil } from "./derived";
import {
  DEFAULT_EXPIRY_LEAD_DAYS,
  EXPIRY_FIELDS,
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
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getExpiryItems(
  supabase: SupabaseClient,
  homeVenueId: string,
  leadDays = DEFAULT_EXPIRY_LEAD_DAYS,
): Promise<ExpiryItem[]> {
  const { data, error } = await supabase
    .from("staff")
    .select(
      "id, emp_no, full_name, passport_expiry, eid_expiry, medical_insurance_expiry_date, ohc_date, pic_date, basic_food_safety_date, fire_safety_date, first_aid_date",
    )
    .eq("home_venue_id", homeVenueId);

  if (error) throw error;

  const items: ExpiryItem[] = [];

  for (const staff of data ?? []) {
    for (const config of EXPIRY_FIELDS) {
      const raw = staff[config.field as keyof typeof staff] as string | null;
      if (!raw) continue;

      let expiryDate = raw;
      if ("renewalMonths" in config && config.renewalMonths) {
        expiryDate = addMonths(raw, config.renewalMonths)
          .toISOString()
          .slice(0, 10);
      }

      const until = daysUntil(expiryDate);
      if (until == null || until > leadDays) continue;

      items.push({
        staffId: staff.id,
        empNo: staff.emp_no,
        fullName: staff.full_name,
        field: config.field,
        label: config.label,
        expiryDate,
        daysUntil: until,
      });
    }
  }

  return items.sort((a, b) => a.daysUntil - b.daysUntil);
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
