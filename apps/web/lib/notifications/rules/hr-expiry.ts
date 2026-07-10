import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateOnly } from "@/lib/hr/derived";
import { computeExpiryItems } from "../expiry";
import { resolveHrStaffRecipients } from "../recipients";
import type { ExpiryItem, NotificationRule } from "../types";
import { DEFAULT_LEAD_DAYS } from "../types";

const HR_EXPIRY_FIELDS = [
  { field: "passport_expiry", label: "Passport" },
  { field: "eid_expiry", label: "Emirates ID" },
  { field: "medical_insurance_expiry_date", label: "Medical insurance" },
  { field: "ohc_date", label: "OHC training", renewalMonths: 12 },
  { field: "pic_date", label: "PIC training", renewalMonths: 12 },
  { field: "basic_food_safety_date", label: "Food safety", renewalMonths: 12 },
  { field: "fire_safety_date", label: "Fire safety", renewalMonths: 12 },
  { field: "first_aid_date", label: "First aid", renewalMonths: 24 },
] as const;

const STAFF_EXPIRY_SELECT =
  "id, emp_no, full_name, home_venue_id, passport_expiry, eid_expiry, medical_insurance_expiry_date, ohc_date, pic_date, basic_food_safety_date, fire_safety_date, first_aid_date";

function formatDaysPhrase(daysUntil: number): string {
  if (daysUntil < 0) {
    return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"} overdue`;
  }
  if (daysUntil === 0) return "today";
  return `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
}

function buildTitle(item: ExpiryItem, _leadDays: number): string {
  return `${item.label} — ${item.displayName}`;
}

function buildBody(item: ExpiryItem, leadDays: number): string {
  const secondary = item.secondaryLabel ? ` (${item.secondaryLabel})` : "";
  return `${item.label} for ${item.displayName}${secondary} is due ${formatDateOnly(item.expiryDate)} (${formatDaysPhrase(item.daysUntil)}). Reminder at ${leadDays}-day lead.`;
}

async function fetchStaffForVenue(
  supabase: SupabaseClient,
  venueId: string,
) {
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_EXPIRY_SELECT)
    .eq("home_venue_id", venueId);

  if (error) throw error;
  return data ?? [];
}

export const hrExpiryRule: NotificationRule = {
  key: "hr-expiry",
  moduleKey: "hr",
  type: "expiry",
  entity: "staff",
  leadDays: [...DEFAULT_LEAD_DAYS],
  expiryFields: [...HR_EXPIRY_FIELDS],
  fetchItems: fetchStaffForVenue,
  buildTitle,
  buildBody,
  resolveRecipients: resolveHrStaffRecipients,
  getVenueId: (item) => item.home_venue_id as string,
  getDisplayName: (item) => item.full_name as string,
  getSecondaryLabel: (item) => item.emp_no as string | undefined,
};

export { HR_EXPIRY_FIELDS, STAFF_EXPIRY_SELECT };

export async function getHrExpiryItems(
  supabase: SupabaseClient,
  venueId: string,
  leadDays: number,
  options?: { allVenues?: boolean },
) {
  let items;
  if (options?.allVenues) {
    const { data: venues, error: venueError } = await supabase
      .from("venues")
      .select("id")
      .eq("is_global", false);
    if (venueError) throw venueError;

    const batches = await Promise.all(
      (venues ?? []).map((v) => fetchStaffForVenue(supabase, v.id)),
    );
    items = batches.flat();
  } else {
    items = await fetchStaffForVenue(supabase, venueId);
  }

  return computeExpiryItems(items, hrExpiryRule.expiryFields, {
    getVenueId: hrExpiryRule.getVenueId,
    getDisplayName: hrExpiryRule.getDisplayName,
    getSecondaryLabel: hrExpiryRule.getSecondaryLabel,
    maxLeadDays: leadDays,
  });
}

/** Map shared expiry items to the legacy HR widget shape. */
export function toHrExpiryWidgetItems(
  items: Awaited<ReturnType<typeof getHrExpiryItems>>,
) {
  return items.map((item) => ({
    staffId: item.sourceId,
    empNo: item.secondaryLabel ?? "",
    fullName: item.displayName,
    field: item.field,
    label: item.label,
    expiryDate: item.expiryDate,
    daysUntil: item.daysUntil,
  }));
}
