"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Mail, UserMinus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/components/ui/toast";
import {
  CONTACT_ACTION_CLASS,
  PhoneWithCountryInput,
} from "@/components/hr/phone-with-country-input";
import { ScopedLink } from "@/components/layout/scoped-link";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { StaffWorkDriveDocumentList } from "@/components/hr/staff-workdrive-document-list";
import { StaffCommunicationsTrail } from "@/components/hr/staff-communications-trail";
import { StaffAssetsPanel } from "@/components/hr/staff-assets-panel";
import { StaffUniformPanel } from "@/components/hr/staff-uniform-panel";
import { StaffEmploymentPath } from "@/components/hr/staff-employment-path";
import {
  listStaffWorkDriveDocs,
  type StaffWorkDriveDocumentListItem,
} from "@/lib/actions/hr-workdrive";
import {
  computeSalaryBreakdown,
  formatAed,
  formatDateOnly,
} from "@/lib/hr/derived";
import type { SalaryPercentages } from "@/lib/hr/derived";
import {
  findStatusIdByName,
  findStatusNameById,
  employmentStatusSurfaceClass,
  suggestEmploymentStatusName,
} from "@/lib/hr/employment-status";
import {
  computeProbation,
  durationExceedsLegalMax,
  PROBATION_MAX_MONTHS,
} from "@/lib/hr/probation";
import type { StaffFormState } from "@/lib/hr/staff-form";
import type {
  CivilStatus,
  Department,
  EmploymentStatus,
  Gender,
  HrWorkDriveDocKind,
  Nationality,
  Position,
} from "@/lib/hr/types";
import { STAFF_TERMINATION_TYPE_OPTIONS } from "@/lib/hr/types";
import { DETACHED_FILE_FORM_ID } from "@/lib/hr/detached-file-form";
import { cn } from "@/lib/utils";

type StaffDocumentUploadResult =
  | {
      ok: true;
      workdriveFileId: string;
      permalink: string;
      path: string;
      fileName: string;
    }
  | { ok: false; error: string };

/** XHR upload so we can report byte progress (fetch has no upload progress). */
function uploadStaffDocumentViaApi(input: {
  staffId: string;
  empNo: string;
  fullName: string;
  docKind: HrWorkDriveDocKind;
  fileSlotId?: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<StaffDocumentUploadResult> {
  const fd = new FormData();
  fd.set("staff_id", input.staffId);
  fd.set("emp_no", input.empNo);
  fd.set("full_name", input.fullName);
  fd.set("doc_kind", input.docKind);
  if (input.fileSlotId) fd.set("file_slot_id", input.fileSlotId);
  fd.set("file", input.file, input.file.name);

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/hr/workdrive/upload");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
      input.onProgress?.(pct);
    };
    xhr.upload.onload = () => {
      // Bytes reached the server; Zoho handoff may still be running.
      input.onProgress?.(100);
    };

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText) as unknown;
      } catch {
        payload = null;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const error =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `Upload failed (${xhr.status}).`;
        resolve({ ok: false, error });
        return;
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { ok?: unknown }).ok !== true
      ) {
        resolve({ ok: false, error: "Unexpected upload response." });
        return;
      }

      const okPayload = payload as {
        workdriveFileId: string;
        permalink: string;
        path: string;
        fileName: string;
      };
      resolve({
        ok: true,
        workdriveFileId: okPayload.workdriveFileId,
        permalink: okPayload.permalink,
        path: okPayload.path,
        fileName: okPayload.fileName,
      });
    };

    xhr.onerror = () => {
      resolve({
        ok: false,
        error: "Upload failed — check your connection and try again.",
      });
    };
    xhr.onabort = () => {
      resolve({ ok: false, error: "Upload cancelled." });
    };

    input.onProgress?.(0);
    xhr.send(fd);
  });
}

export const STAFF_ENTRY_FORM_ID = "staff-entry-form";

export const STAFF_ENTRY_TABS = [
  "identity",
  "contact",
  "employment",
  "employment_path",
  "documents",
  "employment_docs",
  "communications",
  "assets",
  "uniform",
] as const;

export type StaffEntryTab = (typeof STAFF_ENTRY_TABS)[number];

type StaffEntryFormProps = {
  value: StaffFormState;
  onChange: (patch: Partial<StaffFormState>) => void;
  onSubmit: (formData: FormData) => void;
  readOnly: boolean;
  lockEmpNo: boolean;
  activeTab: StaffEntryTab | null;
  onRequestTab?: (tab: StaffEntryTab) => void;
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  genders: Gender[];
  civilStatuses: CivilStatus[];
  salaryPct: SalaryPercentages;
  canViewSalary: boolean;
  /** Permission to record position/salary alterations on Employment Path. */
  canEditPath?: boolean;
  /** Called when a persisted path alteration updates current staff fields. */
  onPersistedStaffPatch?: (patch: Partial<StaffFormState>) => void;
  /** Saved staff id — required to start or open offboarding. */
  staffId?: string | null;
  /** Active (non-completed / non-cancelled) offboarding process id, if any. */
  offboardingProcessId?: string | null;
  /** Permission to start a new offboarding process. */
  canStartOffboarding?: boolean;
};

/** Same shape used elsewhere in the app (users, email transport). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

const labelClass = "mb-1 block text-xs font-medium text-black/55";
const inlineLabelClass =
  "mb-0 w-40 shrink-0 text-xs font-medium text-black/55";
const fieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/55";
const readonlyFieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-black/[0.03] px-3 text-sm text-black/60";

function SectionCard({
  title,
  children,
  contentClassName,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  contentClassName?: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col p-5", className)}>
      {title ? (
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
          {title}
        </h3>
      ) : null}
      <div
        className={cn(
          "min-h-0 flex-1",
          contentClassName ?? "space-y-4",
        )}
      >
        {children}
      </div>
    </Card>
  );
}

type EmploymentDocDateField = {
  field: keyof StaffFormState;
  label: string;
  inputId: string;
};

const EMPLOYMENT_DOC_SLOTS: {
  title: string;
  docKind: HrWorkDriveDocKind;
  documentTitle: string;
  dateFields?: EmploymentDocDateField[];
}[] = [
  {
    title: "Offer Letter",
    docKind: "offer_letter",
    documentTitle: "Offer Letter document",
  },
  {
    title: "Labour Contract",
    docKind: "contract",
    documentTitle: "Labour Contract document",
    dateFields: [
      {
        field: "contract_expiry",
        label: "Contract expiry",
        inputId: "contract_expiry",
      },
    ],
  },
  {
    title: "Addendums",
    docKind: "addendums",
    documentTitle: "Addendums document",
  },
  {
    title: "eResidence Card",
    docKind: "eresidence_card",
    documentTitle: "eResidence Card document",
    dateFields: [
      {
        field: "eresidence_expiry",
        label: "eResidence expiry",
        inputId: "eresidence_expiry",
      },
    ],
  },
  {
    title: "OHC Occupational Health Certificate",
    docKind: "ohc",
    documentTitle: "OHC document",
    dateFields: [
      {
        field: "ohc_date",
        label: "OHC date",
        inputId: "ohc_date",
      },
    ],
  },
  {
    title: "Medical Insurance",
    docKind: "medical_insurance",
    documentTitle: "Medical Insurance document",
    dateFields: [
      {
        field: "medical_insurance_expiry_date",
        label: "Insurance expiry",
        inputId: "medical_insurance_expiry_date",
      },
    ],
  },
  {
    title: "Training Certificates",
    docKind: "training_certificates",
    documentTitle: "Training Certificates document",
    dateFields: [
      { field: "pic_date", label: "PIC date", inputId: "pic_date" },
      {
        field: "basic_food_safety_date",
        label: "Food safety date",
        inputId: "basic_food_safety_date",
      },
      {
        field: "fire_safety_date",
        label: "Fire safety date",
        inputId: "fire_safety_date",
      },
      {
        field: "first_aid_date",
        label: "First aid date",
        inputId: "first_aid_date",
      },
    ],
  },
  {
    title: "Others",
    docKind: "others",
    documentTitle: "Others document",
  },
];

function WorkDriveDocUploadCard({
  title,
  docKind,
  fileSlotId,
  staffId,
  empNo,
  fullName,
  readOnly,
  successLabel,
}: {
  title: string;
  docKind: HrWorkDriveDocKind;
  fileSlotId?: string;
  staffId: string | null;
  empNo: string;
  fullName: string;
  readOnly: boolean;
  successLabel: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [driveNote, setDriveNote] = useState<string | null>(null);
  const [docs, setDocs] = useState<StaffWorkDriveDocumentListItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!staffId) {
      setDocs([]);
      setDocsLoading(false);
      return;
    }
    let cancelled = false;
    setDocsLoading(true);
    void listStaffWorkDriveDocs({ staffId, docKind }).then((result) => {
      if (cancelled) return;
      if (result.ok) setDocs(result.items);
      else setDocs([]);
      setDocsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId, docKind]);

  return (
    <SectionCard
      title={title}
      className="h-full w-full"
      contentClassName="flex h-full flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:items-start">
        <StaffDocumentUploadSlot
          className="shrink-0"
          label="Drag & drop or click to upload"
          file={file}
          onFileChange={(next) => {
            setFile(next);
            setDriveNote(null);
          }}
          readOnly={readOnly}
          uploadingToDrive={uploading}
          uploadProgress={uploadProgress}
          driveUploadNote={driveNote}
          onUploadToDrive={
            readOnly || !file
              ? undefined
              : () => {
                  if (uploading) return;
                  void (async () => {
                    if (!file) return;
                    if (!staffId) {
                      toast.error("Save the staff record before uploading.");
                      return;
                    }
                    setUploading(true);
                    setUploadProgress(0);
                    try {
                      const result = await uploadStaffDocumentViaApi({
                        staffId,
                        empNo: empNo.trim(),
                        fullName: fullName.trim(),
                        docKind,
                        fileSlotId,
                        file,
                        onProgress: setUploadProgress,
                      });
                      if (!result.ok) {
                        toast.error(result.error);
                        setDriveNote(result.error);
                        return;
                      }
                      toast.saved(`${successLabel} uploaded to WorkDrive`);
                      setDriveNote(null);
                      setFile(null);
                      const refreshed = await listStaffWorkDriveDocs({
                        staffId,
                        docKind,
                      });
                      if (refreshed.ok) setDocs(refreshed.items);
                    } catch (error) {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Upload failed.";
                      toast.error(message);
                      setDriveNote(message);
                    } finally {
                      setUploading(false);
                      setUploadProgress(null);
                    }
                  })();
                }
          }
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {docsLoading && docs.length === 0 ? (
            <p className="text-[11px] text-black/40">Loading documents…</p>
          ) : null}
          <StaffWorkDriveDocumentList
            items={docs}
            readOnly={readOnly}
            className="mt-0"
            onDeleted={(documentId) => {
              setDocs((prev) => prev.filter((row) => row.id !== documentId));
            }}
          />
          {!docsLoading && docs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-4 text-center text-[11px] text-black/40">
              No files uploaded yet
            </p>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function Field({
  label,
  htmlFor,
  children,
  hint,
  layout = "stacked",
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
  layout?: "stacked" | "inline";
}) {
  if (layout === "inline") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <label htmlFor={htmlFor} className={inlineLabelClass}>
            {label}
          </label>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        {hint ? (
          <p className="pl-[calc(10rem+0.75rem)] text-[11px] text-black/35">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-black/35">{hint}</p> : null}
    </div>
  );
}

export function StaffEntryForm({
  value,
  onChange,
  onSubmit,
  readOnly,
  lockEmpNo,
  activeTab,
  onRequestTab,
  departments,
  positions,
  statuses,
  nationalities,
  genders,
  civilStatuses,
  salaryPct,
  canViewSalary,
  canEditPath = false,
  onPersistedStaffPatch,
  staffId = null,
  offboardingProcessId = null,
  canStartOffboarding = false,
}: StaffEntryFormProps) {
  const [autoEmploymentStatus, setAutoEmploymentStatus] = useState(true);
  const [autoStatusHelpOpen, setAutoStatusHelpOpen] = useState(false);
  const [compensationUnlocked, setCompensationUnlocked] = useState(false);
  const [compensationConfirmOpen, setCompensationConfirmOpen] = useState(false);
  const prevAutoRef = useRef(false);
  const prevDatesRef = useRef({
    joining: value.joining_date,
    termination: value.termination_date,
  });
  const didInitStatusRef = useRef(false);

  const set =
    (field: keyof StaffFormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      onChange({ [field]: e.target.value } as Partial<StaffFormState>);

  /** First/last edits also keep full name in sync until it's diverged manually. */
  const setName = (field: "first_name" | "last_name") => (v: string) => {
    const prevDerived = [value.first_name, value.last_name]
      .filter(Boolean)
      .join(" ");
    const next = { ...value, [field]: v };
    const nextDerived = [next.first_name, next.last_name]
      .filter(Boolean)
      .join(" ");
    const patch: Partial<StaffFormState> = { [field]: v };
    if (!value.full_name || value.full_name === prevDerived) {
      patch.full_name = nextDerived;
    }
    onChange(patch);
  };

  const departmentPositions = useMemo(
    () =>
      value.department_id
        ? positions.filter((p) => p.department_id === value.department_id)
        : positions,
    [positions, value.department_id],
  );

  const probation = useMemo(
    () =>
      computeProbation({
        joiningDate: value.joining_date,
        durationValue: value.probation_duration_value,
        durationUnit: value.probation_duration_unit,
        probationStatus: value.probation_status,
        terminationDate: value.termination_date,
      }),
    [
      value.joining_date,
      value.probation_duration_value,
      value.probation_duration_unit,
      value.probation_status,
      value.termination_date,
    ],
  );

  const probationExceedsMax = durationExceedsLegalMax(
    value.joining_date,
    value.probation_duration_value
      ? Number(value.probation_duration_value)
      : null,
    value.probation_duration_unit === "days" ||
      value.probation_duration_unit === "months"
      ? value.probation_duration_unit
      : null,
  );

  const probationSummary = useMemo(() => {
    if (!probation.legalEndDate) return null;
    const endLabel = formatDateOnly(probation.legalEndDate);
    if (probation.status === "Expired") {
      return `Probation Period Expired ${endLabel}`;
    }
    if (probation.status === "Confirmed") {
      return `Confirmed · ended ${endLabel}`;
    }
    if (probation.status === "Terminated") {
      return `Terminated · end date ${endLabel}`;
    }
    const remaining = probation.remainingDays ?? 0;
    return `Last day ${endLabel} · ${remaining} day${remaining === 1 ? "" : "s"} remaining`;
  }, [
    probation.legalEndDate,
    probation.remainingDays,
    probation.status,
  ]);

  useEffect(() => {
    if (!autoEmploymentStatus || readOnly) {
      prevAutoRef.current = autoEmploymentStatus;
      prevDatesRef.current = {
        joining: value.joining_date,
        termination: value.termination_date,
      };
      return;
    }

    const datesChanged =
      prevDatesRef.current.joining !== value.joining_date ||
      prevDatesRef.current.termination !== value.termination_date;
    const autoJustEnabled = !prevAutoRef.current && autoEmploymentStatus;
    const firstSync = !didInitStatusRef.current;

    prevAutoRef.current = autoEmploymentStatus;
    prevDatesRef.current = {
      joining: value.joining_date,
      termination: value.termination_date,
    };

    if (!firstSync && !datesChanged && !autoJustEnabled) return;

    const suggested = suggestEmploymentStatusName({
      joiningDate: value.joining_date,
      terminationDate: value.termination_date,
    });
    const nextId = findStatusIdByName(statuses, suggested);
    if (!nextId) return;

    didInitStatusRef.current = true;
    if (nextId === value.employment_status_id) return;
    onChange({ employment_status_id: nextId });
  }, [
    autoEmploymentStatus,
    readOnly,
    value.joining_date,
    value.termination_date,
    value.employment_status_id,
    statuses,
    onChange,
  ]);

  useEffect(() => {
    if (readOnly) {
      setCompensationUnlocked(false);
      setCompensationConfirmOpen(false);
    }
  }, [readOnly, staffId]);

  /** Existing staff: lock Compensation until they confirm editing without a Path record. */
  const compensationGuarded = Boolean(staffId) && !readOnly;
  const compensationDisabled =
    readOnly || (compensationGuarded && !compensationUnlocked);

  function requestCompensationEdit() {
    if (readOnly || compensationUnlocked || !staffId) return;
    setCompensationConfirmOpen(true);
  }

  const inAccommodation = value.company_accommodation.toLowerCase() === "yes";
  const wageNumber =
    value.wage_package.trim() === "" ? null : Number(value.wage_package);
  const breakdown = computeSalaryBreakdown(
    wageNumber != null && Number.isFinite(wageNumber) ? wageNumber : null,
    inAccommodation,
    salaryPct,
  );

  const flyHomeTicket = useMemo(() => {
    const nat = nationalities.find((n) => n.id === value.nationality_id);
    return nat?.fly_home_ticket_value ?? null;
  }, [nationalities, value.nationality_id]);

  const numOrEmpty = (n: number | null) => (n == null ? "" : String(n));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Validate here instead of HTML `required` — inactive tab panels use
    // `display: none`, and browsers refuse to focus hidden required fields.
    if (!value.emp_no.trim()) {
      onRequestTab?.("identity");
      toast.error("Employee number is required.");
      return;
    }
    if (!value.full_name.trim()) {
      onRequestTab?.("identity");
      toast.error("Full name is required.");
      return;
    }
    const personalEmail = value.personal_email.trim();
    if (personalEmail && !isValidEmail(personalEmail)) {
      onRequestTab?.("contact");
      toast.error("Personal email must be a valid email address.");
      return;
    }
    const workEmail = value.work_email.trim();
    if (workEmail && !isValidEmail(workEmail)) {
      onRequestTab?.("contact");
      toast.error("Work email must be a valid email address.");
      return;
    }
    onSubmit(new FormData(e.currentTarget));
  }

  /**
   * Block implicit form submission from the Enter key while typing in a field.
   * Without this, a stray Enter silently triggers a save and drops the user
   * back into read-only mode. Saving must be an explicit click on "Save".
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    const target = e.target as HTMLElement;
    if (
      e.key === "Enter" &&
      target instanceof HTMLInputElement &&
      target.type !== "submit" &&
      target.type !== "button"
    ) {
      e.preventDefault();
    }
  }

  const identityCard = (
    <SectionCard contentClassName="space-y-3">
      <Field
        layout="inline"
        label="Employee no *"
        htmlFor="emp_no"
        hint="Auto-generated by default — override if needed."
      >
        <input
          id="emp_no"
          name="emp_no"
          value={value.emp_no}
          onChange={set("emp_no")}
          disabled={readOnly || lockEmpNo}
          className={fieldClass}
        />
      </Field>
      <Field
        layout="inline"
        label="Full name *"
        htmlFor="full_name"
        hint="First + last."
      >
        <input
          id="full_name"
          name="full_name"
          value={value.full_name}
          onChange={set("full_name")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field layout="inline" label="First name" htmlFor="first_name">
        <input
          id="first_name"
          name="first_name"
          value={value.first_name}
          onChange={(e) => setName("first_name")(e.target.value)}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field layout="inline" label="Last name" htmlFor="last_name">
        <input
          id="last_name"
          name="last_name"
          value={value.last_name}
          onChange={(e) => setName("last_name")(e.target.value)}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field layout="inline" label="Gender" htmlFor="gender">
        <select
          id="gender"
          name="gender"
          value={value.gender}
          onChange={set("gender")}
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="">—</option>
          {genders.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field layout="inline" label="Civil status" htmlFor="civil_status">
        <select
          id="civil_status"
          name="civil_status"
          value={value.civil_status}
          onChange={set("civil_status")}
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="">—</option>
          {civilStatuses.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field layout="inline" label="Date of birth" htmlFor="dob">
        <DateInput
          id="dob"
          name="dob"
          value={value.dob}
          onChange={(iso) => onChange({ dob: iso })}
          disabled={readOnly}
          className="w-full"
          inputClassName={fieldClass}
        />
      </Field>
      <Field layout="inline" label="Nationality" htmlFor="nationality_id">
        <select
          id="nationality_id"
          name="nationality_id"
          value={value.nationality_id}
          onChange={set("nationality_id")}
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="">—</option>
          {nationalities.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </Field>
    </SectionCard>
  );

  const contactCard = (
    <SectionCard contentClassName="space-y-3">
      <Field layout="inline" label="Contact phone" htmlFor="contact_phone">
        <PhoneWithCountryInput
          id="contact_phone"
          name="contact_phone"
          value={value.contact_phone}
          onChange={(next) => onChange({ contact_phone: next })}
          disabled={readOnly}
          inputClassName={fieldClass}
          reserveTrailing
        />
      </Field>
      <Field layout="inline" label="WhatsApp" htmlFor="whatsapp">
        <PhoneWithCountryInput
          id="whatsapp"
          name="whatsapp"
          value={value.whatsapp}
          onChange={(next) => onChange({ whatsapp: next })}
          disabled={readOnly}
          placeholder="Same as phone if unchanged"
          inputClassName={fieldClass}
          whatsappLink
        />
      </Field>
      <Field layout="inline" label="Personal email" htmlFor="personal_email">
        <div className="flex gap-2">
          <input
            id="personal_email"
            name="personal_email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={value.personal_email}
            onChange={set("personal_email")}
            disabled={readOnly}
            aria-invalid={
              value.personal_email.trim() !== "" &&
              !isValidEmail(value.personal_email)
            }
            className={cn(
              fieldClass,
              "min-w-0 flex-1",
              value.personal_email.trim() !== "" &&
                !isValidEmail(value.personal_email) &&
                "border-red-400 focus:border-red-400 focus:ring-red-400/20",
            )}
          />
          {isValidEmail(value.personal_email) ? (
            <a
              href={`mailto:${value.personal_email.trim()}`}
              title="Send email"
              aria-label="Send personal email"
              className={cn(
                CONTACT_ACTION_CLASS,
                "border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 text-[#3D421F] hover:bg-[var(--venue-primary)]/20",
              )}
            >
              <Mail className="h-4 w-4" />
            </a>
          ) : (
            <span
              title={
                value.personal_email.trim()
                  ? "Enter a valid email"
                  : "Enter an email first"
              }
              aria-hidden
              className={cn(
                CONTACT_ACTION_CLASS,
                "border-black/10 bg-black/[0.03] text-black/25",
              )}
            >
              <Mail className="h-4 w-4" />
            </span>
          )}
        </div>
      </Field>
      <Field layout="inline" label="Work email" htmlFor="work_email">
        <div className="flex gap-2">
          <input
            id="work_email"
            name="work_email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={value.work_email}
            onChange={set("work_email")}
            disabled={readOnly}
            aria-invalid={
              value.work_email.trim() !== "" && !isValidEmail(value.work_email)
            }
            className={cn(
              fieldClass,
              "min-w-0 flex-1",
              value.work_email.trim() !== "" &&
                !isValidEmail(value.work_email) &&
                "border-red-400 focus:border-red-400 focus:ring-red-400/20",
            )}
          />
          {isValidEmail(value.work_email) ? (
            <a
              href={`mailto:${value.work_email.trim()}`}
              title="Send email"
              aria-label="Send work email"
              className={cn(
                CONTACT_ACTION_CLASS,
                "border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 text-[#3D421F] hover:bg-[var(--venue-primary)]/20",
              )}
            >
              <Mail className="h-4 w-4" />
            </a>
          ) : (
            <span
              title={
                value.work_email.trim()
                  ? "Enter a valid email"
                  : "Enter an email first"
              }
              aria-hidden
              className={cn(
                CONTACT_ACTION_CLASS,
                "border-black/10 bg-black/[0.03] text-black/25",
              )}
            >
              <Mail className="h-4 w-4" />
            </span>
          )}
        </div>
      </Field>
    </SectionCard>
  );

  const rolesCard = (
    <SectionCard title="Roles &amp; status" contentClassName="space-y-3">
      <Field layout="inline" label="Department" htmlFor="department_id">
        <select
          id="department_id"
          name="department_id"
          value={value.department_id}
          onChange={(e) =>
            onChange({ department_id: e.target.value, position_id: "" })
          }
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field layout="inline" label="Position" htmlFor="position_id">
        <select
          id="position_id"
          name="position_id"
          value={value.position_id}
          onChange={set("position_id")}
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="">—</option>
          {departmentPositions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <hr className="border-black/10" />
      <Field
        layout="inline"
        label="Employment Status"
        htmlFor="employment_status_id"
      >
        <select
          id="employment_status_id"
          name="employment_status_id"
          value={value.employment_status_id}
          onChange={set("employment_status_id")}
          disabled={readOnly}
          className={cn(
            fieldClass,
            employmentStatusSurfaceClass(
              findStatusNameById(statuses, value.employment_status_id),
            ),
          )}
        >
          <option value="">—</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="rounded-lg border border-black/10 bg-white/70 px-3 py-2.5 text-left">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAutoStatusHelpOpen((o) => !o)}
            aria-expanded={autoStatusHelpOpen}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-black/40 transition-transform",
                autoStatusHelpOpen && "rotate-180",
              )}
            />
            <span className="text-xs font-semibold text-[#3D421F]">
              Auto employment status
            </span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={autoEmploymentStatus}
            aria-label="Auto employment status"
            disabled={readOnly}
            onClick={() => setAutoEmploymentStatus((v) => !v)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
              autoEmploymentStatus
                ? "bg-[var(--venue-primary,#818a40)]"
                : "bg-black/20",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                autoEmploymentStatus ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        </div>
        {autoStatusHelpOpen ? (
          <div className="mt-2 space-y-1.5 border-t border-black/5 pt-2">
            <ul className="space-y-0.5 text-[11px] leading-snug text-black/50">
              <li>
                <span className="font-medium text-black/65">Hiring</span> — no
                joining date
              </li>
              <li>
                <span className="font-medium text-black/65">ON Board</span> —
                joining date set
              </li>
              <li>
                <span className="font-medium text-black/65">OFF Board</span> —
                termination date set (same month)
              </li>
              <li>
                <span className="font-medium text-black/65">OUT</span> — from the
                month after termination
              </li>
            </ul>
            <p className="text-[11px] text-black/40">
              Status can still be changed manually. Auto re-applies when joining
              or termination dates change.
            </p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );

  const employmentCard = (
    <SectionCard title="Employment" contentClassName="space-y-3">
      <Field layout="inline" label="Joining date" htmlFor="joining_date">
        <DateInput
          id="joining_date"
          name="joining_date"
          value={value.joining_date}
          onChange={(iso) => onChange({ joining_date: iso })}
          disabled={readOnly}
          className="w-full"
          inputClassName={fieldClass}
        />
      </Field>
      <Field layout="inline" label="Contract type" htmlFor="contract_kind">
        <select
          id="contract_kind"
          name="contract_kind"
          value={value.contract_kind}
          onChange={set("contract_kind")}
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="">—</option>
          <option value="Full-time">Full-time</option>
          <option value="Part-time">Part-time</option>
          <option value="Freelancing">Freelancing</option>
        </select>
      </Field>
      <Field
        layout="inline"
        label="Probation duration"
        htmlFor="probation_duration_value"
        hint={`Configurable, maximum ${PROBATION_MAX_MONTHS} calendar months. Leave and absence do not extend the end date.`}
      >
        <div className="flex gap-2">
          <input
            id="probation_duration_value"
            name="probation_duration_value"
            type="number"
            min="1"
            max={
              value.probation_duration_unit === "months"
                ? PROBATION_MAX_MONTHS
                : undefined
            }
            step="1"
            inputMode="numeric"
            value={value.probation_duration_value}
            onChange={set("probation_duration_value")}
            disabled={readOnly}
            className={cn(fieldClass, "flex-1")}
            placeholder="e.g. 3"
          />
          <select
            id="probation_duration_unit"
            name="probation_duration_unit"
            value={value.probation_duration_unit || "months"}
            onChange={set("probation_duration_unit")}
            disabled={readOnly}
            className={cn(fieldClass, "w-[7.5rem] shrink-0")}
          >
            <option value="days">Days</option>
            <option value="months">Months</option>
          </select>
        </div>
        {probationExceedsMax ? (
          <p className="mt-1 text-[11px] text-red-700/80">
            Duration exceeds the {PROBATION_MAX_MONTHS}-month legal maximum from
            the commencement date.
          </p>
        ) : null}
      </Field>
      <Field layout="inline" label="Probation period">
        <div
          className={cn(
            readonlyFieldClass,
            "flex items-center leading-snug",
            probation.status === "Pending" &&
              "border-amber-200 bg-amber-50 text-amber-800",
            probation.status === "Expired" &&
              "border-red-200 bg-red-50 text-red-800/85",
          )}
          aria-live="polite"
        >
          {probationSummary == null ? (
            <span className="text-black/40">—</span>
          ) : (
            <span className="truncate">{probationSummary}</span>
          )}
        </div>
        <input
          type="hidden"
          name="probation_status"
          value={probation.status ?? ""}
        />
      </Field>
      <div className="-mx-1 space-y-3 rounded-lg bg-black/[0.07] px-3 py-3">
        <Field
          layout="inline"
          label="Termination date"
          htmlFor="termination_date"
        >
          <DateInput
            id="termination_date"
            name="termination_date"
            value={value.termination_date}
            onChange={(iso) =>
              onChange({
                termination_date: iso,
                ...(iso ? {} : { termination_type: "" }),
              })
            }
            disabled={readOnly}
            className="w-full"
            inputClassName={fieldClass}
          />
        </Field>
        {value.termination_date ? (
          <>
            <Field
              layout="inline"
              label="Termination type"
              htmlFor="termination_type"
              hint="Used for gratuity & service charge entitlement. Venue policy is set under Settings → Pay → Benefits."
            >
              <select
                id="termination_type"
                name="termination_type"
                value={value.termination_type}
                onChange={set("termination_type")}
                disabled={readOnly}
                className={fieldClass}
              >
                <option value="">— Select —</option>
                {STAFF_TERMINATION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            {staffId ? (
              offboardingProcessId || canStartOffboarding ? (
                <ScopedLink
                  href={
                    offboardingProcessId
                      ? `/hr/offboarding/${offboardingProcessId}`
                      : `/hr/offboarding/start?staffId=${encodeURIComponent(staffId)}`
                  }
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#3D421F] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  <UserMinus
                    className="h-4 w-4 shrink-0 opacity-90"
                    aria-hidden
                  />
                  {offboardingProcessId
                    ? "Open OFF-Boarding Process"
                    : "Initiate OFF-Boarding Process"}
                </ScopedLink>
              ) : null
            ) : (
              <p className="text-xs text-black/45">
                Save the employee first to start offboarding.
              </p>
            )}
          </>
        ) : null}
      </div>
    </SectionCard>
  );

  const visaCard = (
    <SectionCard title="Visa" contentClassName="space-y-3">
      <Field layout="inline" label="Visa status" htmlFor="visa_status">
        <select
          id="visa_status"
          name="visa_status"
          value={value.visa_status}
          onChange={set("visa_status")}
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="">—</option>
          <option value="Visa Self Owned">Visa Self Owned</option>
          <option value="Visa Provided">Visa Provided</option>
          <option value="Visa Pending">Visa Pending</option>
        </select>
      </Field>
      <Field layout="inline" label="Visa expiry" htmlFor="visa_expiry">
        <DateInput
          id="visa_expiry"
          name="visa_expiry"
          value={value.visa_expiry}
          onChange={(iso) => onChange({ visa_expiry: iso })}
          disabled={readOnly}
          className="w-full"
          inputClassName={fieldClass}
        />
      </Field>
    </SectionCard>
  );

  const compensationCard = canViewSalary ? (
    <SectionCard title="Compensation" contentClassName="space-y-3">
      {compensationGuarded && !compensationUnlocked ? (
        <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-950/80">
          Prefer recording salary changes under{" "}
          <button
            type="button"
            className="font-semibold underline decoration-amber-700/40 underline-offset-2 hover:decoration-amber-800"
            onClick={() => onRequestTab?.("employment_path")}
          >
            Employment Path → Position / Salary
          </button>
          . Edit here only if you intentionally skip a path reference.
        </p>
      ) : null}
      <div
        className={
          compensationGuarded && !compensationUnlocked
            ? "relative space-y-3"
            : "space-y-3"
        }
      >
        {compensationGuarded && !compensationUnlocked ? (
          <button
            type="button"
            className="absolute inset-0 z-10 cursor-pointer rounded-md"
            aria-label="Unlock compensation editing"
            onClick={requestCompensationEdit}
          />
        ) : null}
      <Field
        layout="inline"
        label="Company accommodation"
        htmlFor="company_accommodation"
      >
        {compensationDisabled && !readOnly ? (
          <input
            type="hidden"
            name="company_accommodation"
            value={value.company_accommodation}
          />
        ) : null}
        <select
          id="company_accommodation"
          name={
            compensationDisabled && !readOnly
              ? undefined
              : "company_accommodation"
          }
          value={value.company_accommodation}
          onChange={set("company_accommodation")}
          disabled={compensationDisabled}
          className={fieldClass}
        >
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </Field>
      <Field
        layout="inline"
        label="Wage package (AED)"
        htmlFor="wage_package"
        hint={`Split ${salaryPct.basic}/${salaryPct.accom}/${salaryPct.transp}.`}
      >
        <input
          id="wage_package"
          name="wage_package"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value.wage_package}
          onChange={set("wage_package")}
          disabled={readOnly}
          readOnly={compensationGuarded && !compensationUnlocked}
          className={fieldClass}
        />
      </Field>
      <Field layout="inline" label={`Basic salary ${salaryPct.basic}%`}>
        <input
          name="basic_salary_60"
          readOnly
          value={numOrEmpty(breakdown.basic)}
          className={readonlyFieldClass}
        />
      </Field>
      <Field layout="inline" label={`Accom. allowance ${salaryPct.accom}%`}>
        <input
          name="accom_all_25"
          readOnly
          value={numOrEmpty(breakdown.accom)}
          className={readonlyFieldClass}
        />
      </Field>
      <Field layout="inline" label={`Transport allowance ${salaryPct.transp}%`}>
        <input
          name="transp_all_15"
          readOnly
          value={numOrEmpty(breakdown.transp)}
          className={readonlyFieldClass}
        />
      </Field>
      <Field
        layout="inline"
        label="Fly home ticket / year"
        htmlFor="fly_home_ticket_per_year"
      >
        <input
          id="fly_home_ticket_per_year"
          name="fly_home_ticket_per_year"
          readOnly
          value={numOrEmpty(flyHomeTicket)}
          placeholder="Select a nationality"
          className={readonlyFieldClass}
        />
      </Field>
      <Field
        layout="inline"
        label="Salary to pay"
        hint={
          inAccommodation
            ? "In accommodation — basic portion only."
            : "Not in accommodation — full package."
        }
      >
        <input
          readOnly
          value={
            breakdown.salaryToPay == null ? "" : formatAed(breakdown.salaryToPay)
          }
          className={readonlyFieldClass}
        />
      </Field>
      </div>

      {compensationConfirmOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setCompensationConfirmOpen(false);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="compensation-confirm-title"
                className="w-full max-w-lg rounded-xl border border-black/10 bg-white p-6 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2
                  id="compensation-confirm-title"
                  className="font-serif text-xl text-[#3D421F]"
                >
                  Modify compensation?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-black/65">
                  Are you sure you want to modify Compensation without creating
                  a reference on the Employment Path?
                </p>
                <p className="mt-2 text-xs leading-relaxed text-black/45">
                  Salary and position changes recorded under{" "}
                  <span className="font-medium text-[#3D421F]">
                    Employment Path → Position / Salary
                  </span>{" "}
                  keep a dated history. Editing here only updates the current
                  values with no path entry.
                </p>
                <div className="mt-5 flex flex-row flex-nowrap items-stretch justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCompensationConfirmOpen(false)}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCompensationConfirmOpen(false);
                      onRequestTab?.("employment_path");
                    }}
                    className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-md border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 px-3 text-center text-sm font-medium leading-tight text-[#3D421F] hover:bg-[var(--venue-primary)]/20 sm:flex-none sm:px-3.5"
                  >
                    Open Employment Path
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCompensationUnlocked(true);
                      setCompensationConfirmOpen(false);
                    }}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-[#3D421F] px-3 text-sm font-semibold text-white hover:bg-[#2f3318] sm:px-3.5"
                  >
                    Continue anyway
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </SectionCard>
  ) : null;

  const passportRow = (
    <div className="flex flex-col items-stretch gap-4 md:flex-row">
      <div className="w-full max-w-lg shrink-0">
        <SectionCard
          title="Passport"
          className="h-full"
          contentClassName="flex h-full flex-col space-y-3"
        >
          <Field layout="inline" label="Passport no." htmlFor="passport_no">
            <input
              id="passport_no"
              name="passport_no"
              value={value.passport_no}
              onChange={set("passport_no")}
              disabled={readOnly}
              className={fieldClass}
            />
          </Field>
          <Field layout="inline" label="Passport expiry" htmlFor="passport_expiry">
            <DateInput
              id="passport_expiry"
              name="passport_expiry"
              value={value.passport_expiry}
              onChange={(iso) => onChange({ passport_expiry: iso })}
              disabled={readOnly}
              className="w-full"
              inputClassName={fieldClass}
            />
          </Field>
        </SectionCard>
      </div>
      <div className="min-w-0 w-full flex-1">
        <WorkDriveDocUploadCard
          title="Passport document"
          docKind="passport"
          staffId={staffId}
          empNo={value.emp_no}
          fullName={value.full_name}
          readOnly={readOnly}
          successLabel="Passport"
        />
      </div>
    </div>
  );

  const emiratesIdRow = (
    <div className="flex flex-col items-stretch gap-4 md:flex-row">
      <div className="w-full max-w-lg shrink-0">
        <SectionCard
          title="Emirates ID"
          className="h-full"
          contentClassName="flex h-full flex-col space-y-3"
        >
          <Field layout="inline" label="EID no." htmlFor="eid_no">
            <input
              id="eid_no"
              name="eid_no"
              value={value.eid_no}
              onChange={set("eid_no")}
              disabled={readOnly}
              className={fieldClass}
            />
          </Field>
          <Field layout="inline" label="EID expiry" htmlFor="eid_expiry">
            <DateInput
              id="eid_expiry"
              name="eid_expiry"
              value={value.eid_expiry}
              onChange={(iso) => onChange({ eid_expiry: iso })}
              disabled={readOnly}
              className="w-full"
              inputClassName={fieldClass}
            />
          </Field>
        </SectionCard>
      </div>
      <div className="min-w-0 w-full flex-1">
        <WorkDriveDocUploadCard
          title="Emirates ID Document"
          docKind="emirates_id"
          staffId={staffId}
          empNo={value.emp_no}
          fullName={value.full_name}
          readOnly={readOnly}
          successLabel="Emirates ID"
        />
      </div>
    </div>
  );

  const bankRow = (
    <div className="flex flex-col items-stretch gap-4 md:flex-row">
      <div className="w-full max-w-lg shrink-0">
        <SectionCard
          title="Bank details"
          className="h-full"
          contentClassName="flex h-full flex-col space-y-3"
        >
          <Field layout="inline" label="IBAN" htmlFor="iban">
            <input
              id="iban"
              name="iban"
              value={value.iban}
              onChange={set("iban")}
              disabled={readOnly}
              className={fieldClass}
            />
          </Field>
          <Field layout="inline" label="Swift code" htmlFor="swift_code">
            <input
              id="swift_code"
              name="swift_code"
              value={value.swift_code}
              onChange={set("swift_code")}
              disabled={readOnly}
              className={fieldClass}
            />
          </Field>
          <Field layout="inline" label="Bank name" htmlFor="bank_name">
            <input
              id="bank_name"
              name="bank_name"
              value={value.bank_name}
              onChange={set("bank_name")}
              disabled={readOnly}
              className={fieldClass}
            />
          </Field>
          <Field layout="inline" label="WPS employee ID" htmlFor="wps_employee_id">
            <input
              id="wps_employee_id"
              name="wps_employee_id"
              value={value.wps_employee_id}
              onChange={set("wps_employee_id")}
              disabled={readOnly}
              className={fieldClass}
              placeholder="MOL / WPS employee number"
            />
          </Field>
        </SectionCard>
      </div>
      <div className="min-w-0 w-full flex-1">
        <WorkDriveDocUploadCard
          title="Bank details Certificate"
          docKind="bank"
          staffId={staffId}
          empNo={value.emp_no}
          fullName={value.full_name}
          readOnly={readOnly}
          successLabel="Bank certificate"
        />
      </div>
    </div>
  );

  const employmentDocsCards = (
    <>
      {EMPLOYMENT_DOC_SLOTS.map(
        ({ title, docKind, documentTitle, dateFields }) => (
          <div
            key={docKind}
            className="flex flex-col items-stretch gap-4 md:flex-row"
          >
            <div className="w-full max-w-lg shrink-0">
              <SectionCard
                title={title}
                className="h-full"
                contentClassName={
                  dateFields?.length
                    ? "flex h-full flex-col space-y-3"
                    : "flex h-full flex-col justify-center space-y-3"
                }
              >
                {dateFields?.length ? (
                  dateFields.map(({ field, label, inputId }) => (
                    <Field
                      key={field}
                      layout="inline"
                      label={label}
                      htmlFor={inputId}
                    >
                      <DateInput
                        id={inputId}
                        name={field}
                        value={value[field]}
                        onChange={(iso) =>
                          onChange({ [field]: iso } as Partial<StaffFormState>)
                        }
                        disabled={readOnly}
                        className="w-full"
                        inputClassName={fieldClass}
                      />
                    </Field>
                  ))
                ) : (
                  <p className="text-sm text-black/45">No document on file.</p>
                )}
              </SectionCard>
            </div>
            <div className="min-w-0 w-full flex-1">
              <WorkDriveDocUploadCard
                title={documentTitle}
                docKind={docKind}
                staffId={staffId}
                empNo={value.emp_no}
                fullName={value.full_name}
                readOnly={readOnly}
                successLabel={title}
              />
            </div>
          </div>
        ),
      )}
    </>
  );

  const communicationsPlaceholder = (
    <StaffCommunicationsTrail staffId={staffId} />
  );

  const assetsPanel = <StaffAssetsPanel staffId={staffId} />;
  const uniformPanel = <StaffUniformPanel staffId={staffId} />;

  const employmentPathPanel = (
    <StaffEmploymentPath
      staffId={staffId}
      joiningDate={value.joining_date || null}
      canViewSalary={canViewSalary}
      canEdit={canEditPath}
      departments={departments}
      positions={positions}
      currentDepartmentId={value.department_id}
      currentPositionId={value.position_id}
      currentWagePackage={value.wage_package}
      currentCompanyAccommodation={value.company_accommodation}
      salaryPct={salaryPct}
      onPositionSalaryApplied={(patch) => {
        onChange(patch);
        onPersistedStaffPatch?.(patch);
      }}
    />
  );

  const wideTab =
    activeTab === "communications" ||
    activeTab === "assets" ||
    activeTab === "uniform" ||
    activeTab === "employment_path" ||
    activeTab === "documents" ||
    activeTab === "employment_docs";

  return (
    <>
      {/* Outside staff-entry-form so file inputs never join its multipart payload. */}
      <form
        id={DETACHED_FILE_FORM_ID}
        className="hidden"
        aria-hidden
        onSubmit={(e) => e.preventDefault()}
      />
      <form
        id={STAFF_ENTRY_FORM_ID}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full space-y-4",
          activeTab === "documents" || activeTab === "employment_docs"
            ? "max-w-none"
            : wideTab
              ? "max-w-3xl"
              : "max-w-lg",
        )}
      >
        {/* Keep inactive panels mounted so FormData still includes every field. */}
        <div
          className={cn("space-y-4", activeTab !== "identity" && "hidden")}
          aria-hidden={activeTab !== "identity"}
        >
          {identityCard}
        </div>
        <div
          className={cn(activeTab !== "contact" && "hidden")}
          aria-hidden={activeTab !== "contact"}
        >
          {contactCard}
        </div>
        <div
          className={cn("space-y-4", activeTab !== "employment" && "hidden")}
          aria-hidden={activeTab !== "employment"}
        >
          {rolesCard}
          {employmentCard}
          {visaCard}
          {compensationCard}
        </div>
        <div
          className={cn(activeTab !== "employment_path" && "hidden")}
          aria-hidden={activeTab !== "employment_path"}
        >
          {employmentPathPanel}
        </div>
        <div
          className={cn("space-y-4", activeTab !== "documents" && "hidden")}
          aria-hidden={activeTab !== "documents"}
        >
          {passportRow}
          {emiratesIdRow}
          {bankRow}
        </div>
        <div
          className={cn("space-y-4", activeTab !== "employment_docs" && "hidden")}
          aria-hidden={activeTab !== "employment_docs"}
        >
          {employmentDocsCards}
        </div>
        <div
          className={cn(activeTab !== "communications" && "hidden")}
          aria-hidden={activeTab !== "communications"}
        >
          {communicationsPlaceholder}
        </div>
        <div
          className={cn(activeTab !== "assets" && "hidden")}
          aria-hidden={activeTab !== "assets"}
        >
          {assetsPanel}
        </div>
        <div
          className={cn(activeTab !== "uniform" && "hidden")}
          aria-hidden={activeTab !== "uniform"}
        >
          {uniformPanel}
        </div>
      </form>
    </>
  );
}
