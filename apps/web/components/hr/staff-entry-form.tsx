"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { StaffProfilePhotoEditor } from "@/components/hr/staff-profile-photo-editor";
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
  Nationality,
  Position,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

export const STAFF_ENTRY_FORM_ID = "staff-entry-form";

type StaffEntryFormProps = {
  value: StaffFormState;
  onChange: (patch: Partial<StaffFormState>) => void;
  onSubmit: (formData: FormData) => void;
  onPhotoFileChange: (file: File | null) => void;
  onPhotoSourceFileChange?: (file: File | null) => void;
  photoCleared: boolean;
  onPhotoClearedChange: (cleared: boolean) => void;
  readOnly: boolean;
  lockEmpNo: boolean;
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  genders: Gender[];
  civilStatuses: CivilStatus[];
  salaryPct: SalaryPercentages;
  canViewSalary: boolean;
};

const labelClass = "mb-1 block text-xs font-medium text-black/55";
const fieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/55";
const readonlyFieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-black/[0.03] px-3 text-sm text-black/60";

function SectionCard({
  title,
  children,
  contentClassName,
}: {
  title: string;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Card className="flex flex-col p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
        {title}
      </h3>
      <div className={cn(contentClassName ?? "space-y-4")}>{children}</div>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
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
  onPhotoFileChange,
  onPhotoSourceFileChange,
  photoCleared,
  onPhotoClearedChange,
  readOnly,
  lockEmpNo,
  departments,
  positions,
  statuses,
  nationalities,
  genders,
  civilStatuses,
  salaryPct,
  canViewSalary,
}: StaffEntryFormProps) {
  const [autoEmploymentStatus, setAutoEmploymentStatus] = useState(true);
  const [autoStatusHelpOpen, setAutoStatusHelpOpen] = useState(false);
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
    <SectionCard title="Identity">
      <Field
        label="Employee no *"
        htmlFor="emp_no"
        hint="Auto-generated by default — override if needed."
      >
        <input
          id="emp_no"
          name="emp_no"
          required
          value={value.emp_no}
          onChange={set("emp_no")}
          disabled={readOnly || lockEmpNo}
          className={fieldClass}
        />
      </Field>
      <Field label="First name" htmlFor="first_name">
        <input
          id="first_name"
          name="first_name"
          value={value.first_name}
          onChange={(e) => setName("first_name")(e.target.value)}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Last name" htmlFor="last_name">
        <input
          id="last_name"
          name="last_name"
          value={value.last_name}
          onChange={(e) => setName("last_name")(e.target.value)}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Full name *" htmlFor="full_name" hint="First + last.">
        <input
          id="full_name"
          name="full_name"
          required
          value={value.full_name}
          onChange={set("full_name")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Gender" htmlFor="gender">
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
      <Field label="Civil status" htmlFor="civil_status">
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
      <Field label="Date of birth" htmlFor="dob">
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
      <Field label="Nationality" htmlFor="nationality_id">
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
    <SectionCard title="Contact">
      <Field label="Contact phone" htmlFor="contact_phone">
        <input
          id="contact_phone"
          name="contact_phone"
          value={value.contact_phone}
          onChange={set("contact_phone")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Personal email" htmlFor="personal_email">
        <input
          id="personal_email"
          name="personal_email"
          type="email"
          value={value.personal_email}
          onChange={set("personal_email")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Work email" htmlFor="work_email">
        <input
          id="work_email"
          name="work_email"
          type="email"
          value={value.work_email}
          onChange={set("work_email")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
    </SectionCard>
  );

  const rolesCard = (
    <SectionCard title="Roles &amp; status">
      <Field label="Department" htmlFor="department_id">
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
      <Field label="Position" htmlFor="position_id">
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
      <Field label="Employment Status" htmlFor="employment_status_id">
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
      <Field label="Visa status" htmlFor="visa_status">
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
      <Field label="Visa expiry" htmlFor="visa_expiry">
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

  const employmentCard = (
    <SectionCard
      title="Employment"
      contentClassName="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <Field label="Joining date" htmlFor="joining_date">
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
      <Field label="Contract type" htmlFor="contract_kind">
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
      <Field label="Termination date" htmlFor="termination_date">
        <DateInput
          id="termination_date"
          name="termination_date"
          value={value.termination_date}
          onChange={(iso) => onChange({ termination_date: iso })}
          disabled={readOnly}
          className="w-full"
          inputClassName={fieldClass}
        />
      </Field>
      <Field
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
      <div>
        <p className={labelClass}>Probation period</p>
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
      </div>
    </SectionCard>
  );

  const compensationCard = canViewSalary ? (
    <SectionCard
      title="Compensation"
      contentClassName="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <Field label="Company accommodation" htmlFor="company_accommodation">
        <select
          id="company_accommodation"
          name="company_accommodation"
          value={value.company_accommodation}
          onChange={set("company_accommodation")}
          disabled={readOnly}
          className={fieldClass}
        >
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </Field>
      <Field
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
          className={fieldClass}
        />
      </Field>
      <Field label={`Basic salary ${salaryPct.basic}%`}>
        <input
          name="basic_salary_60"
          readOnly
          value={numOrEmpty(breakdown.basic)}
          className={readonlyFieldClass}
        />
      </Field>
      <Field label={`Accom. allowance ${salaryPct.accom}%`}>
        <input
          name="accom_all_25"
          readOnly
          value={numOrEmpty(breakdown.accom)}
          className={readonlyFieldClass}
        />
      </Field>
      <Field label={`Transport allowance ${salaryPct.transp}%`}>
        <input
          name="transp_all_15"
          readOnly
          value={numOrEmpty(breakdown.transp)}
          className={readonlyFieldClass}
        />
      </Field>
      <Field label="Fly home ticket / year" htmlFor="fly_home_ticket_per_year">
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
    </SectionCard>
  ) : null;

  const documentsCard = (
    <SectionCard
      title="Documents"
      contentClassName="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      <Field label="Passport no." htmlFor="passport_no">
        <input
          id="passport_no"
          name="passport_no"
          value={value.passport_no}
          onChange={set("passport_no")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Passport expiry" htmlFor="passport_expiry">
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
      <Field label="EID no." htmlFor="eid_no">
        <input
          id="eid_no"
          name="eid_no"
          value={value.eid_no}
          onChange={set("eid_no")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="EID expiry" htmlFor="eid_expiry">
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
  );

  const bankCard = (
    <SectionCard
      title="Bank details"
      contentClassName="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <Field label="IBAN" htmlFor="iban">
        <input
          id="iban"
          name="iban"
          value={value.iban}
          onChange={set("iban")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Swift code" htmlFor="swift_code">
        <input
          id="swift_code"
          name="swift_code"
          value={value.swift_code}
          onChange={set("swift_code")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
      <Field label="Bank name" htmlFor="bank_name">
        <input
          id="bank_name"
          name="bank_name"
          value={value.bank_name}
          onChange={set("bank_name")}
          disabled={readOnly}
          className={fieldClass}
        />
      </Field>
    </SectionCard>
  );

  const photoCard = (
    <SectionCard title="Profile photo">
      <StaffProfilePhotoEditor
        photoUrl={value.photo_url}
        onPhotoUrlChange={(url) => {
          onChange({ photo_url: url });
          if (url) onPhotoClearedChange(false);
        }}
        onPhotoFileChange={onPhotoFileChange}
        onSourceFileChange={onPhotoSourceFileChange}
        onCleared={() => {
          onPhotoClearedChange(true);
          onChange({ photo_url: "" });
          onPhotoFileChange(null);
          onPhotoSourceFileChange?.(null);
        }}
        readOnly={readOnly}
      />
      {photoCleared ? <input type="hidden" name="photo_clear" value="1" /> : null}
    </SectionCard>
  );

  return (
    <form
      id={STAFF_ENTRY_FORM_ID}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="space-y-4"
    >
      <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-4">{identityCard}</div>
        <div className="space-y-4">{rolesCard}</div>
        <div className="space-y-4">
          {photoCard}
          {contactCard}
        </div>
      </div>
      {employmentCard}
      {documentsCard}
      {bankCard}
      {compensationCard}
    </form>
  );
}
