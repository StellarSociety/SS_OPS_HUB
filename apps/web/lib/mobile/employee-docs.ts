import {
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  staffVisaHistorySettingKey,
  type HrWorkDriveDocKind,
} from "@/lib/hr/types";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll";
import type { StaffWorkDriveDocumentRow } from "@/lib/hr/workdrive/documents";
import { createServiceClient } from "@/lib/supabase/service";

const PERSONAL_KINDS: readonly HrWorkDriveDocKind[] = [
  "passport",
  "emirates_id",
  "bank",
];

const EMPLOYMENT_KINDS: readonly HrWorkDriveDocKind[] = [
  "offer_letter",
  "contract",
  "addendums",
  "eresidence_card",
  "ohc",
  "training_certificates",
  "visa_noc",
  "visa_cancelation",
  "others",
];

const INSURANCE_KINDS: readonly HrWorkDriveDocKind[] = ["medical_insurance"];

const KIND_ORDER = new Map<HrWorkDriveDocKind, number>(
  [...PERSONAL_KINDS, ...EMPLOYMENT_KINDS, ...INSURANCE_KINDS].map(
    (kind, index) => [kind, index],
  ),
);

export type MobileDocsFile = {
  id: string;
  kind: HrWorkDriveDocKind;
  label: string;
  fileName: string;
  uploadedAt: string;
  workdriveFileId: string;
  contentType: string | null;
};

export type MobileDocsPayslip = {
  payslipId: string;
  payrollMonth: string;
  payrollMonthLabel: string;
  version: number;
  netSalary: number;
};

export type MobileDocsField = {
  label: string;
  value: string | null;
  kind: "text" | "date";
};

export type MobileDocsSection = {
  id: string;
  title: string;
  fields: MobileDocsField[];
  files: MobileDocsFile[];
};

export type MobileDocsPage = {
  linked: boolean;
  staffId: string | null;
  personal: MobileDocsFile[];
  employment: MobileDocsFile[];
  insurance: MobileDocsFile[];
  insuranceExpiry: string | null;
  personalSections: MobileDocsSection[];
  employmentSections: MobileDocsSection[];
  payslips: MobileDocsPayslip[];
};

export function emptyMobileDocsPage(): MobileDocsPage {
  return {
    linked: false,
    staffId: null,
    personal: [],
    employment: [],
    insurance: [],
    insuranceExpiry: null,
    personalSections: [],
    employmentSections: [],
    payslips: [],
  };
}

function folderForKind(kind: HrWorkDriveDocKind) {
  return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.find((folder) => folder.kind === kind);
}

function documentLabel(
  kind: HrWorkDriveDocKind,
  fileSlotId: string | null,
): string {
  const folder = folderForKind(kind);
  const kindName = folder?.folderName ?? kind.replaceAll("_", " ");
  const slotId = fileSlotId?.trim() || "default";
  const slot = folder?.fileSlots.find((item) => item.id === slotId);
  if (slot && slot.id !== "default" && (folder?.fileSlots.length ?? 0) > 1) {
    return `${kindName} · ${slot.label}`;
  }
  return kindName;
}

function mapDocument(row: StaffWorkDriveDocumentRow): MobileDocsFile {
  return {
    id: row.id,
    kind: row.doc_kind,
    label: documentLabel(row.doc_kind, row.file_slot_id),
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    workdriveFileId: row.workdrive_file_id,
    contentType: row.content_type,
  };
}

function sortDocuments(rows: MobileDocsFile[]): MobileDocsFile[] {
  return [...rows].sort((a, b) => {
    const kindDelta =
      (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99);
    if (kindDelta !== 0) return kindDelta;
    const labelDelta = a.label.localeCompare(b.label);
    if (labelDelta !== 0) return labelDelta;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });
}

function isoDate(raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function textValue(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

function filesForKind(
  files: MobileDocsFile[],
  kind: HrWorkDriveDocKind,
): MobileDocsFile[] {
  return files.filter((file) => file.kind === kind);
}

function section(input: {
  id: string;
  title: string;
  fields?: MobileDocsField[];
  files: MobileDocsFile[];
}): MobileDocsSection {
  return {
    id: input.id,
    title: input.title,
    fields: input.fields ?? [],
    files: input.files,
  };
}

function latestVisaCancelationDate(rawValue: unknown): string | null {
  const records = Array.isArray((rawValue as { records?: unknown } | null)?.records)
    ? ((rawValue as { records: unknown[] }).records ?? [])
    : [];
  const sorted = [...records].sort((a, b) => {
    const rowA = a as { issueDate?: string | null; createdAt?: string | null };
    const rowB = b as { issueDate?: string | null; createdAt?: string | null };
    const issueDelta = String(rowB.issueDate ?? "").localeCompare(
      String(rowA.issueDate ?? ""),
    );
    if (issueDelta !== 0) return issueDelta;
    return String(rowB.createdAt ?? "").localeCompare(String(rowA.createdAt ?? ""));
  });
  for (const row of sorted) {
    const date = isoDate((row as { cancelDate?: unknown }).cancelDate);
    if (date) return date;
  }
  return isoDate((sorted[0] as { cancelDate?: unknown } | undefined)?.cancelDate);
}

function listMonthlyPayslips(
  rows: Array<{
    id: string;
    version: number | null;
    snapshot: Record<string, unknown> | null;
    run: { payroll_month?: string } | { payroll_month?: string }[] | null;
  }>,
): MobileDocsPayslip[] {
  const byMonth = new Map<string, MobileDocsPayslip>();

  for (const row of rows) {
    const run = Array.isArray(row.run) ? row.run[0] : row.run;
    const snapshot = row.snapshot;
    const rawMonth =
      (typeof run?.payroll_month === "string" && run.payroll_month) ||
      (typeof snapshot?.payrollMonth === "string" && snapshot.payrollMonth) ||
      "";
    const monthKey = rawMonth.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;

    const version = Number(row.version) || 1;
    const existing = byMonth.get(monthKey);
    if (existing && version <= existing.version) continue;

    const payrollMonth =
      rawMonth.length >= 10 ? rawMonth.slice(0, 10) : `${monthKey}-01`;
    let payrollMonthLabel = monthKey;
    try {
      payrollMonthLabel = formatPayrollMonthLabel(payrollMonth);
    } catch {
      /* keep YYYY-MM */
    }

    byMonth.set(monthKey, {
      payslipId: row.id,
      payrollMonth,
      payrollMonthLabel,
      version,
      netSalary: Number(snapshot?.netSalary ?? 0),
    });
  }

  return [...byMonth.values()].sort((a, b) =>
    b.payrollMonth.localeCompare(a.payrollMonth),
  );
}

export async function loadMobileStaffDocsPage(opts: {
  staffId: string;
  venueId: string;
}): Promise<MobileDocsPage> {
  const staffId = opts.staffId.trim();
  if (!staffId) return emptyMobileDocsPage();

  const service = createServiceClient();
  const { data: staff } = await service
    .from("staff")
    .select(
      [
        "id",
        "medical_insurance_expiry_date",
        "passport_no",
        "passport_expiry",
        "eid_no",
        "eid_issue_date",
        "eid_expiry",
        "iban",
        "swift_code",
        "bank_name",
        "wps_employee_id",
        "contract_expiry",
        "eresidence_expiry",
        "ohc_date",
        "pic_date",
        "basic_food_safety_date",
        "fire_safety_date",
        "first_aid_date",
      ].join(", "),
    )
    .eq("id", staffId)
    .maybeSingle();
  if (!staff?.id) return emptyMobileDocsPage();

  const [docsResult, payslipsResult, visaHistoryResult] = await Promise.all([
    service
      .from("hr_staff_workdrive_documents")
      .select("*")
      .eq("venue_id", opts.venueId)
      .eq("staff_id", staffId)
      .is("missing_at", null)
      .order("uploaded_at", { ascending: false }),
    service
      .from("hr_payslips")
      .select("id, version, snapshot, run:hr_payroll_runs(payroll_month)")
      .eq("venue_id", opts.venueId)
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .limit(240),
    service
      .from("hr_venue_settings")
      .select("value")
      .eq("venue_id", opts.venueId)
      .eq("key", staffVisaHistorySettingKey(staffId))
      .maybeSingle(),
  ]);

  if (docsResult.error) {
    console.error("[mobile/docs] documents:", docsResult.error.message);
  }
  if (payslipsResult.error) {
    console.error("[mobile/docs] payslips:", payslipsResult.error.message);
  }
  if (visaHistoryResult.error) {
    console.error("[mobile/docs] visa history:", visaHistoryResult.error.message);
  }

  const documents = ((docsResult.data ?? []) as StaffWorkDriveDocumentRow[])
    .filter((row) => row.doc_kind !== "profile_photo")
    .map(mapDocument);

  const personal = sortDocuments(
    documents.filter((row) =>
      (PERSONAL_KINDS as readonly string[]).includes(row.kind),
    ),
  );
  const employment = sortDocuments(
    documents.filter((row) =>
      (EMPLOYMENT_KINDS as readonly string[]).includes(row.kind),
    ),
  );
  const insurance = sortDocuments(
    documents.filter((row) =>
      (INSURANCE_KINDS as readonly string[]).includes(row.kind),
    ),
  );

  const insuranceExpiry = isoDate(staff.medical_insurance_expiry_date);
  const visaCancelationDate = latestVisaCancelationDate(
    visaHistoryResult.data?.value,
  );

  const personalSections: MobileDocsSection[] = [
    section({
      id: "passport",
      title: "Passport",
      fields: [
        { label: "Passport no.", value: textValue(staff.passport_no), kind: "text" },
        {
          label: "Passport Expiry Date",
          value: isoDate(staff.passport_expiry),
          kind: "date",
        },
      ],
      files: filesForKind(personal, "passport"),
    }),
    section({
      id: "emirates_id",
      title: "Emirates ID",
      fields: [
        { label: "EID no.", value: textValue(staff.eid_no), kind: "text" },
        {
          label: "EID issue date",
          value: isoDate(staff.eid_issue_date),
          kind: "date",
        },
        { label: "EID expiry", value: isoDate(staff.eid_expiry), kind: "date" },
      ],
      files: filesForKind(personal, "emirates_id"),
    }),
    section({
      id: "bank",
      title: "Bank details",
      fields: [
        { label: "IBAN", value: textValue(staff.iban), kind: "text" },
        { label: "Swift code", value: textValue(staff.swift_code), kind: "text" },
        { label: "Bank name", value: textValue(staff.bank_name), kind: "text" },
        {
          label: "WPS employee ID",
          value: textValue(staff.wps_employee_id),
          kind: "text",
        },
      ],
      files: filesForKind(personal, "bank"),
    }),
  ];

  const employmentSections: MobileDocsSection[] = [
    section({
      id: "offer_letter",
      title: "Offer Letter",
      files: filesForKind(employment, "offer_letter"),
    }),
    section({
      id: "contract",
      title: "Labour Contract",
      fields: [
        {
          label: "Contract expiry",
          value: isoDate(staff.contract_expiry),
          kind: "date",
        },
      ],
      files: filesForKind(employment, "contract"),
    }),
    section({
      id: "addendums",
      title: "Addendums",
      files: filesForKind(employment, "addendums"),
    }),
    section({
      id: "eresidence_card",
      title: "eResidence Card",
      fields: [
        {
          label: "eResidence expiry",
          value: isoDate(staff.eresidence_expiry),
          kind: "date",
        },
      ],
      files: filesForKind(employment, "eresidence_card"),
    }),
    section({
      id: "ohc",
      title: "OHC Occupational Health Certificate",
      fields: [
        { label: "OHC date", value: isoDate(staff.ohc_date), kind: "date" },
      ],
      files: filesForKind(employment, "ohc"),
    }),
    section({
      id: "training_certificates",
      title: "Training Certificates",
      fields: [
        { label: "PIC date", value: isoDate(staff.pic_date), kind: "date" },
        {
          label: "Food safety date",
          value: isoDate(staff.basic_food_safety_date),
          kind: "date",
        },
        {
          label: "Fire safety date",
          value: isoDate(staff.fire_safety_date),
          kind: "date",
        },
        {
          label: "First aid date",
          value: isoDate(staff.first_aid_date),
          kind: "date",
        },
      ],
      files: filesForKind(employment, "training_certificates"),
    }),
    section({
      id: "others",
      title: "Others",
      files: filesForKind(employment, "others"),
    }),
    section({
      id: "visa_cancelation",
      title: "Visa Cancelation",
      fields: [
        {
          label: "Cancelation date",
          value: visaCancelationDate,
          kind: "date",
        },
      ],
      files: filesForKind(employment, "visa_cancelation"),
    }),
  ];

  const visaNocFiles = filesForKind(employment, "visa_noc");
  if (visaNocFiles.length > 0) {
    employmentSections.splice(
      employmentSections.findIndex((row) => row.id === "others"),
      0,
      section({
        id: "visa_noc",
        title: "Visa NOC",
        files: visaNocFiles,
      }),
    );
  }

  return {
    linked: true,
    staffId,
    personal,
    employment,
    insurance,
    insuranceExpiry,
    personalSections,
    employmentSections,
    payslips: listMonthlyPayslips(
      (payslipsResult.data ?? []) as Array<{
        id: string;
        version: number | null;
        snapshot: Record<string, unknown> | null;
        run: { payroll_month?: string } | { payroll_month?: string }[] | null;
      }>,
    ),
  };
}

export async function loadMobileEmployeeDocsPage(opts: {
  userId: string;
  venueId: string;
}): Promise<MobileDocsPage> {
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("staff_id")
    .eq("id", opts.userId)
    .maybeSingle();

  const staffId =
    (profile?.staff_id as string | null | undefined)?.trim() || null;
  if (!staffId) return emptyMobileDocsPage();

  return loadMobileStaffDocsPage({
    staffId,
    venueId: opts.venueId,
  });
}
