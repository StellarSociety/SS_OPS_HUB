import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSalaryBreakdown,
  formatAed,
  formatDateOnly,
  isInAccommodation,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import {
  mergeAcknowledgementPageSettings,
  parseAcknowledgementStatus,
  type HrAcknowledgementPageSettings,
  type HrEmailAcknowledgementStatus,
} from "@/lib/hr/acknowledgement";
import { getHrVenueSetting, listAssetsForStaff } from "@/lib/hr/store";
import { listUniformItemsForStaff } from "@/lib/hr/uniform-store";
import {
  ASSET_STATUS_LABELS,
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
  STAFF_TERMINATION_TYPE_OPTIONS,
  type AssetStatus,
  type HrSalaryDefaults,
} from "@/lib/hr/types";

export type MobileProfilePathEvent = {
  id: string;
  date: string;
  title: string;
  lines: string[];
};

export type MobileProfileDisciplinaryAction = {
  id: string;
  date: string;
  title: string;
  detail: string | null;
};

export type MobileProfileUniformItem = {
  id: string;
  name: string;
  quantity: number;
  providedAt: string | null;
  notes: string | null;
};

export type MobileProfileAssetItem = {
  id: string;
  name: string;
  type: string | null;
  serial: string | null;
  value: string | null;
  assignedAt: string | null;
  status: string;
};

export type MobileProfileAssetTerms = {
  token: string;
  status: HrEmailAcknowledgementStatus;
  sentAt: string | null;
  respondedAt: string | null;
  subject: string;
  comments: string;
  settings: HrAcknowledgementPageSettings;
  bodyHtml: string | null;
  bodyText: string | null;
};

export type MobileProfileSections = {
  pathEvents: MobileProfilePathEvent[];
  disciplinaryActions: MobileProfileDisciplinaryAction[];
  uniforms: MobileProfileUniformItem[];
  assets: MobileProfileAssetItem[];
  assetTerms: MobileProfileAssetTerms | null;
};

export function emptyMobileProfileSections(): MobileProfileSections {
  return {
    pathEvents: [],
    disciplinaryActions: [],
    uniforms: [],
    assets: [],
    assetTerms: null,
  };
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roleLabel(position: string | null, department: string | null): string {
  return [position, department].filter(Boolean).join(" · ");
}

function terminationTitle(type: string | null | undefined): string {
  const match = STAFF_TERMINATION_TYPE_OPTIONS.find((opt) => opt.value === type);
  return match?.label ?? "Employment ended";
}

function changeTitle(kind: string, changeVisa: boolean): string {
  const base =
    kind === "position"
      ? "Position"
      : kind === "salary"
        ? "Salary"
        : kind === "both"
          ? "Position & salary"
          : kind === "visa"
            ? "Visa"
            : "Change";
  if (kind === "visa") return base;
  return changeVisa ? `${base} · Visa` : base;
}

function accomPhrase(flag: string | null | undefined): string {
  return flag === "Yes" ? "Company accommodation" : "";
}

function moneyWithAccom(
  wage: number | null,
  accommodation: string | null | undefined,
): string {
  const money = formatAed(wage);
  const extra = accomPhrase(accommodation);
  return extra ? `${money} · ${extra}` : money;
}

function salaryToPayLabel(
  wage: number | null,
  accommodation: string | null | undefined,
  pct: SalaryPercentages,
): string {
  if (wage == null) return "—";
  const pay = computeSalaryBreakdown(
    wage,
    isInAccommodation(accommodation),
    pct,
  );
  return formatAed(pay.salaryToPay);
}

function visaLabel(status: string | null, expiry: string | null): string {
  const label = status?.trim() || "—";
  const date = expiry?.slice(0, 10) || "";
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${label} · ${formatDateOnly(date)}`
    : label;
}

async function loadLookupNames(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{
  departments: Map<string, string>;
  positions: Map<string, string>;
}> {
  const [{ data: departments }, { data: positions }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("venue_id", venueId),
    supabase.from("positions").select("id, name").eq("venue_id", venueId),
  ]);
  return {
    departments: new Map(
      (departments ?? []).map((row) => [String(row.id), String(row.name)]),
    ),
    positions: new Map(
      (positions ?? []).map((row) => [String(row.id), String(row.name)]),
    ),
  };
}

async function loadSalaryPct(
  supabase: SupabaseClient,
  venueId: string,
): Promise<SalaryPercentages> {
  const defaults = venueId
    ? await getHrVenueSetting<HrSalaryDefaults>(
        supabase,
        venueId,
        HR_SETTINGS_KEYS.salaryDefaults,
        DEFAULT_HR_SALARY_DEFAULTS,
      )
    : DEFAULT_HR_SALARY_DEFAULTS;
  return {
    basic: defaults.basicPct,
    accom: defaults.accomPct,
    transp: defaults.transpPct,
  };
}

async function loadPathEvents(
  supabase: SupabaseClient,
  opts: {
    venueId: string;
    staffId: string;
    joiningDate: string | null;
    terminationDate: string | null;
    terminationType: string | null;
    department: string | null;
    position: string | null;
    wagePackage?: number | string | null;
    accommodation?: string | null;
  },
): Promise<MobileProfilePathEvent[]> {
  const [{ data, error }, names, pct] = await Promise.all([
    supabase
      .from("hr_staff_position_salary_changes")
      .select("*")
      .eq("venue_id", opts.venueId)
      .eq("staff_id", opts.staffId)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false }),
    loadLookupNames(supabase, opts.venueId),
    loadSalaryPct(supabase, opts.venueId),
  ]);

  if (error) {
    console.error("[mobile] loadPathEvents:", error.message);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const events: MobileProfilePathEvent[] = [];

  let startPosition = opts.position;
  let startDepartment = opts.department;
  let startWage = numOrNull(opts.wagePackage);
  let startAccom = opts.accommodation ?? "No";

  for (const row of rows) {
    const kind = String(row.change_kind ?? "");
    const changeVisa = Boolean(row.change_visa) || kind === "visa";
    const fromDeptId = (row.from_department_id as string | null) ?? null;
    const toDeptId = (row.to_department_id as string | null) ?? null;
    const fromPosId = (row.from_position_id as string | null) ?? null;
    const toPosId = (row.to_position_id as string | null) ?? null;
    const fromDept = fromDeptId ? (names.departments.get(fromDeptId) ?? null) : null;
    const toDept = toDeptId ? (names.departments.get(toDeptId) ?? null) : null;
    const fromPos = fromPosId ? (names.positions.get(fromPosId) ?? null) : null;
    const toPos = toPosId ? (names.positions.get(toPosId) ?? null) : null;
    const fromWage = numOrNull(row.from_wage_package);
    const toWage = numOrNull(row.to_wage_package);
    const fromAccom = (row.from_company_accommodation as string | null) ?? null;
    const toAccom = (row.to_company_accommodation as string | null) ?? null;
    const date = String(row.effective_date ?? "").slice(0, 10);
    const lines: string[] = [];

    if (kind === "position" || kind === "both") {
      lines.push(
        `${roleLabel(fromPos, fromDept) || "—"} → ${roleLabel(toPos, toDept) || "—"}`,
      );
      startPosition = fromPos || startPosition;
      startDepartment = fromDept || startDepartment;
    }
    if (kind === "salary" || kind === "both") {
      lines.push(
        `Package ${moneyWithAccom(fromWage, fromAccom)} → ${moneyWithAccom(toWage, toAccom)}`,
      );
      lines.push(
        `Salary to pay ${salaryToPayLabel(fromWage, fromAccom, pct)} → ${salaryToPayLabel(toWage, toAccom, pct)}`,
      );
      startWage = fromWage;
      startAccom = fromAccom || startAccom;
    }
    if (kind === "visa" || changeVisa) {
      const fromExpiry = row.from_visa_expiry
        ? String(row.from_visa_expiry).slice(0, 10)
        : null;
      const toExpiry = row.to_visa_expiry
        ? String(row.to_visa_expiry).slice(0, 10)
        : null;
      lines.push(
        `Visa ${visaLabel(String(row.from_visa_status ?? ""), fromExpiry)} → ${visaLabel(String(row.to_visa_status ?? ""), toExpiry)}`,
      );
    }

    const reason = String(row.reason ?? "").trim();
    if (reason) lines.push(`Reason: ${reason}`);
    const notes = String(row.notes ?? "").trim();
    if (notes) lines.push(notes);

    if (date) {
      events.push({
        id: String(row.id),
        date,
        title: changeTitle(kind, changeVisa),
        lines,
      });
    }
  }

  if (opts.terminationDate) {
    events.push({
      id: `term-${opts.terminationDate}`,
      date: opts.terminationDate.slice(0, 10),
      title: terminationTitle(opts.terminationType),
      lines: ["Employment ended"],
    });
  }

  if (opts.joiningDate) {
    const startLines: string[] = [];
    const role = roleLabel(startPosition, startDepartment);
    if (role) startLines.push(role);
    if (startWage != null) {
      startLines.push(`Package ${moneyWithAccom(startWage, startAccom)}`);
      startLines.push(
        `Salary to pay ${salaryToPayLabel(startWage, startAccom, pct)}`,
      );
    }
    events.push({
      id: `join-${opts.joiningDate}`,
      date: opts.joiningDate.slice(0, 10),
      title: "Employment started",
      lines: startLines,
    });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

async function loadAssetTerms(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
): Promise<MobileProfileAssetTerms | null> {
  const [{ data, error }, storedSettings] = await Promise.all([
    supabase
      .from("hr_email_acknowledgements")
      .select(
        "token, status, subject, comments, sent_at, responded_at, body_html, body_text",
      )
      .eq("venue_id", venueId)
      .eq("staff_id", staffId)
      .eq("email_kind", "asset_terms")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getHrVenueSetting<Partial<HrAcknowledgementPageSettings>>(
      supabase,
      venueId,
      HR_SETTINGS_KEYS.acknowledgementPage,
      {},
    ),
  ]);

  if (error) {
    console.error("[mobile] loadAssetTerms:", error.message);
    return null;
  }
  if (!data) return null;

  const token = String(data.token ?? "").trim();
  if (!token) return null;

  let bodyHtml = String(data.body_html ?? "").trim() || null;
  let bodyText = String(data.body_text ?? "").trim() || null;
  if (!bodyHtml && !bodyText) {
    const subject = String(data.subject ?? "").trim();
    let query = supabase
      .from("hr_email_messages")
      .select("body_html, body_text, occurred_at")
      .eq("venue_id", venueId)
      .eq("staff_id", staffId)
      .eq("direction", "outbound")
      .limit(8);
    if (subject) query = query.eq("subject", subject);
    const { data: messages } = await query;
    const match = messages?.[0];
    if (match) {
      bodyHtml = String(match.body_html ?? "").trim() || null;
      bodyText = String(match.body_text ?? "").trim() || bodyHtml;
    }
  }

  return {
    token,
    status: parseAcknowledgementStatus(data.status),
    sentAt: data.sent_at ? String(data.sent_at) : null,
    respondedAt: data.responded_at ? String(data.responded_at) : null,
    subject: String(data.subject ?? "").trim() || "Asset T&Cs",
    comments: String(data.comments ?? "").trim(),
    settings: mergeAcknowledgementPageSettings(storedSettings),
    bodyHtml,
    bodyText,
  };
}

export async function loadEmployeeProfileSections(
  supabase: SupabaseClient,
  opts: {
    venueId: string;
    staffId: string;
    joiningDate: string | null;
    terminationDate: string | null;
    terminationType: string | null;
    department: string | null;
    position: string | null;
    wagePackage?: number | string | null;
    accommodation?: string | null;
  },
): Promise<MobileProfileSections> {
  if (!opts.venueId || !opts.staffId) return emptyMobileProfileSections();

  const [pathEvents, uniforms, assets, assetTerms] = await Promise.all([
    loadPathEvents(supabase, opts),
    listUniformItemsForStaff(supabase, opts.staffId),
    listAssetsForStaff(supabase, opts.staffId),
    loadAssetTerms(supabase, opts.venueId, opts.staffId),
  ]);

  return {
    pathEvents,
    disciplinaryActions: [],
    uniforms: uniforms.map((item) => ({
      id: item.id,
      name: item.piece?.name?.trim() || "Unknown piece",
      quantity: item.quantity,
      providedAt: item.provided_at?.slice(0, 10) || null,
      notes: item.notes?.trim() || null,
    })),
    assets: assets.map((asset) => ({
      id: asset.assignment_id,
      name: asset.name,
      type: asset.asset_type?.name ?? null,
      serial: asset.serial_no?.trim() || null,
      value:
        Number(asset.asset_value) > 0 ? formatAed(Number(asset.asset_value)) : null,
      assignedAt: asset.assigned_at?.slice(0, 10) || null,
      status:
        ASSET_STATUS_LABELS[asset.status as AssetStatus] ?? asset.status,
    })),
    assetTerms,
  };
}
