import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  matchesCertificationFileSlot,
  workDriveTargetForCertField,
} from "@/lib/hr/certification-workdrive";
import { ensureCertificationCostBreakdown } from "@/lib/hr/certification-costs";
import { addMonths, daysUntil } from "@/lib/hr/derived";
import {
  listAllStaff,
  listCertificationTypes,
  listDepartments,
  listEmploymentStatuses,
  listPositions,
} from "@/lib/hr/store";
import type {
  CertificationEmployeeRow,
  CertificationExpenseMonth,
  CertificationStaffField,
  CertificationStatus,
  CertificationType,
  StaffCertificationCell,
  StaffWithLookups,
} from "@/lib/hr/types";

const CERT_STAFF_FIELDS = new Set<CertificationStaffField>([
  "ohc_date",
  "pic_date",
  "basic_food_safety_date",
  "fire_safety_date",
  "first_aid_date",
]);

function isCertStaffField(
  value: string | null | undefined,
): value is CertificationStaffField {
  return Boolean(
    value && CERT_STAFF_FIELDS.has(value as CertificationStaffField),
  );
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function staffDate(
  staff: StaffWithLookups,
  field: CertificationStaffField,
): string | null {
  const raw = staff[field];
  if (!raw) return null;
  const trimmed = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function normalizeCertificationType(
  raw: Record<string, unknown>,
): CertificationType {
  const staffFieldRaw =
    raw.staff_field == null ? null : String(raw.staff_field);
  const costs = ensureCertificationCostBreakdown({
    cost_value: Number(raw.cost_value) || 0,
    cost_net: Number(raw.cost_net) || 0,
    cost_vat: Number(raw.cost_vat) || 0,
  });
  return {
    id: String(raw.id),
    name: String(raw.name ?? "").trim(),
    label: String(raw.label ?? "").trim(),
    renewal_months: Number(raw.renewal_months) || 12,
    lead_days: Number(raw.lead_days) || 30,
    sort_order: Number(raw.sort_order) || 0,
    staff_field: isCertStaffField(staffFieldRaw) ? staffFieldRaw : null,
    provider_company: String(raw.provider_company ?? "").trim(),
    contact_person: String(raw.contact_person ?? "").trim(),
    contact_email: String(raw.contact_email ?? "").trim(),
    contact_phone: String(raw.contact_phone ?? "").trim(),
    cost_value: costs.cost_value,
    cost_net: costs.cost_net,
    cost_vat: costs.cost_vat,
    archived_at: raw.archived_at ? String(raw.archived_at) : null,
  };
}

export function buildStaffCertificationCell(
  cert: CertificationType,
  staff: StaffWithLookups,
  hasDocument = false,
  employeeProvided = false,
): StaffCertificationCell | null {
  if (!cert.staff_field) return null;
  const certifiedAt = staffDate(staff, cert.staff_field);
  const renewalMonths = Math.max(1, cert.renewal_months || 12);
  const leadDays = Math.max(0, cert.lead_days || 30);
  const expiresAt = certifiedAt
    ? toIsoDate(addMonths(certifiedAt, renewalMonths))
    : null;
  const until = expiresAt != null ? daysUntil(expiresAt) : null;

  let status: CertificationStatus = "missing";
  if (expiresAt != null && until != null) {
    if (until < 0) status = "expired";
    else if (until <= leadDays) status = "expiring";
    else status = "valid";
  }

  return {
    certificationId: cert.id,
    name: cert.name,
    staffField: cert.staff_field,
    certifiedAt,
    expiresAt,
    daysUntilExpiry: until,
    status,
    renewalMonths,
    leadDays,
    costValue: cert.cost_value,
    hasDocument,
    employeeProvided,
  };
}

type CertDocMeta = {
  staff_id: string;
  doc_kind: string;
  file_name: string;
  file_slot_id: string | null;
};

function staffHasCertDocument(
  docs: CertDocMeta[],
  staffId: string,
  staffField: CertificationStaffField,
): boolean {
  const target = workDriveTargetForCertField(staffField);
  const pool = docs.filter(
    (d) => d.staff_id === staffId && d.doc_kind === target.docKind,
  );
  if (pool.length === 0) return false;
  if (target.docKind === "ohc") return true;
  const slotId = target.fileSlotId ?? null;
  return pool.some((d) =>
    matchesCertificationFileSlot(d.file_name, slotId, d.file_slot_id),
  );
}

async function listVenueCertificationDocuments(
  supabase: SupabaseClient,
  venueId: string,
  staffIds: string[],
): Promise<CertDocMeta[]> {
  if (staffIds.length === 0) return [];
  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .select("staff_id, doc_kind, file_name, file_slot_id")
    .eq("venue_id", venueId)
    .in("staff_id", staffIds)
    .in("doc_kind", ["ohc", "training_certificates"]);
  if (error) {
    console.error("[hr] listVenueCertificationDocuments:", error.message);
    return [];
  }
  return (data ?? []) as CertDocMeta[];
}

/** staffId::staffField → employee_provided */
async function listVenueEmployeeProvidedFlags(
  supabase: SupabaseClient,
  venueId: string,
  staffIds: string[],
): Promise<Set<string>> {
  const provided = new Set<string>();
  if (staffIds.length === 0) return provided;
  const { data, error } = await supabase
    .from("hr_staff_certification_flags")
    .select("staff_id, staff_field, employee_provided")
    .eq("venue_id", venueId)
    .in("staff_id", staffIds)
    .eq("employee_provided", true);
  if (error) {
    console.error("[hr] listVenueEmployeeProvidedFlags:", error.message);
    return provided;
  }
  for (const row of data ?? []) {
    const staffId = String(row.staff_id ?? "");
    const field = String(row.staff_field ?? "");
    if (staffId && field) provided.add(`${staffId}::${field}`);
  }
  return provided;
}

function isEmployeeProvided(
  flags: Set<string>,
  staffId: string,
  staffField: CertificationStaffField | null | undefined,
): boolean {
  if (!staffField) return false;
  return flags.has(`${staffId}::${staffField}`);
}

export async function loadCertificationTypesNormalized(
  supabase: SupabaseClient,
): Promise<CertificationType[]> {
  const rows = await listCertificationTypes(supabase);
  return (rows as Record<string, unknown>[])
    .map(normalizeCertificationType)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export async function loadCertificationsDetailsPage(supabase: SupabaseClient) {
  const types = await loadCertificationTypesNormalized(supabase);
  return { types };
}

export async function loadCertificationsEmployeesPage(
  supabase: SupabaseClient,
  venueId: string,
) {
  const [types, staff, departments, positions, statuses] = await Promise.all([
    loadCertificationTypesNormalized(supabase),
    listAllStaff(supabase),
    listDepartments(supabase, venueId),
    listPositions(supabase, venueId),
    listEmploymentStatuses(supabase),
  ]);

  const tracked = types.filter((t) => t.staff_field && !t.archived_at);
  const venueStaff = staff.filter((s) => s.home_venue_id === venueId);
  const staffIds = venueStaff.map((s) => s.id);
  const [docs, employeeProvidedFlags] = await Promise.all([
    listVenueCertificationDocuments(supabase, venueId, staffIds),
    listVenueEmployeeProvidedFlags(supabase, venueId, staffIds),
  ]);

  const rows: CertificationEmployeeRow[] = venueStaff
    .map((s) => ({
      staff: s,
      certifications: tracked
        .map((cert) =>
          buildStaffCertificationCell(
            cert,
            s,
            cert.staff_field
              ? staffHasCertDocument(docs, s.id, cert.staff_field)
              : false,
            isEmployeeProvided(employeeProvidedFlags, s.id, cert.staff_field),
          ),
        )
        .filter((cell): cell is StaffCertificationCell => cell != null),
    }))
    .sort((a, b) => a.staff.full_name.localeCompare(b.staff.full_name));

  return {
    types: tracked,
    rows,
    staff: venueStaff,
    departments,
    positions,
    statuses,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatExpenseMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-AE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Aggregate certification costs by issue-date month and certification type.
 * One unit cost per staff member who has that certification's issue date set.
 */
export async function loadCertificationsExpensesPage(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{ months: CertificationExpenseMonth[] }> {
  const [types, staff] = await Promise.all([
    loadCertificationTypesNormalized(supabase),
    listAllStaff(supabase),
  ]);

  const tracked = types.filter((t) => t.staff_field);
  const venueStaff = staff.filter((s) => s.home_venue_id === venueId);
  const employeeProvidedFlags = await listVenueEmployeeProvidedFlags(
    supabase,
    venueId,
    venueStaff.map((s) => s.id),
  );

  type Acc = {
    certificationId: string;
    name: string;
    label: string;
    sortOrder: number;
    count: number;
    unitNet: number;
    unitVat: number;
    unitGross: number;
    staff: {
      staffId: string;
      empNo: string;
      fullName: string;
      certifiedAt: string;
      photoUrl: string | null;
    }[];
  };

  const byMonth = new Map<string, Map<string, Acc>>();

  for (const s of venueStaff) {
    for (const cert of tracked) {
      if (!cert.staff_field) continue;
      if (isEmployeeProvided(employeeProvidedFlags, s.id, cert.staff_field)) {
        continue;
      }
      const certifiedAt = staffDate(s, cert.staff_field);
      if (!certifiedAt) continue;

      const costs = ensureCertificationCostBreakdown({
        cost_value: cert.cost_value,
        cost_net: cert.cost_net,
        cost_vat: cert.cost_vat,
      });

      const monthKey = certifiedAt.slice(0, 7);
      let monthMap = byMonth.get(monthKey);
      if (!monthMap) {
        monthMap = new Map();
        byMonth.set(monthKey, monthMap);
      }

      const staffEntry = {
        staffId: s.id,
        empNo: s.emp_no,
        fullName: s.full_name,
        certifiedAt,
        photoUrl: s.photo_url ?? null,
      };

      const existing = monthMap.get(cert.id);
      if (existing) {
        existing.count += 1;
        existing.staff.push(staffEntry);
      } else {
        monthMap.set(cert.id, {
          certificationId: cert.id,
          name: cert.name,
          label: cert.label || cert.name,
          sortOrder: cert.sort_order,
          count: 1,
          unitNet: costs.cost_net,
          unitVat: costs.cost_vat,
          unitGross: costs.cost_value,
          staff: [staffEntry],
        });
      }
    }
  }

  const months: CertificationExpenseMonth[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([monthKey, linesMap]) => {
      const lines = [...linesMap.values()]
        .map((row) => {
          const staff = [...row.staff].sort((a, b) =>
            a.certifiedAt < b.certifiedAt
              ? 1
              : a.certifiedAt > b.certifiedAt
                ? -1
                : a.fullName.localeCompare(b.fullName),
          );
          const latestCertifiedAt = staff[0]?.certifiedAt ?? `${monthKey}-01`;
          return {
            certificationId: row.certificationId,
            name: row.name,
            label: row.label,
            count: row.count,
            net: roundMoney(row.unitNet * row.count),
            vat: roundMoney(row.unitVat * row.count),
            gross: roundMoney(row.unitGross * row.count),
            staff,
            latestCertifiedAt,
            sortOrder: row.sortOrder,
          };
        })
        .sort((a, b) => {
          if (a.latestCertifiedAt !== b.latestCertifiedAt) {
            return a.latestCertifiedAt < b.latestCertifiedAt ? 1 : -1;
          }
          return (
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
          );
        })
        .map(({ latestCertifiedAt: _latest, sortOrder: _sort, ...line }) => line);

      return {
        monthKey,
        label: formatExpenseMonthLabel(monthKey),
        lines,
        totalNet: roundMoney(lines.reduce((sum, l) => sum + l.net, 0)),
        totalVat: roundMoney(lines.reduce((sum, l) => sum + l.vat, 0)),
        totalGross: roundMoney(lines.reduce((sum, l) => sum + l.gross, 0)),
        totalCount: lines.reduce((sum, l) => sum + l.count, 0),
      };
    });

  return { months };
}
