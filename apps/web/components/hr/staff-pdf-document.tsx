"use client";

import {
  computeSalaryBreakdown,
  formatAed,
  formatDateOnly,
} from "@/lib/hr/derived";
import type { SalaryPercentages } from "@/lib/hr/derived";
import type { StaffFormState } from "@/lib/hr/staff-form";
import type {
  CivilStatus,
  Department,
  EmploymentStatus,
  Gender,
  Nationality,
  Position,
} from "@/lib/hr/types";

type StaffPdfDocumentProps = {
  value: StaffFormState;
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  genders: Gender[];
  civilStatuses: CivilStatus[];
  salaryPct: SalaryPercentages;
  canViewSalary: boolean;
  venueName: string;
};

function nameOf<T extends { id: string; name: string }>(
  items: T[],
  id: string,
): string {
  return items.find((i) => i.id === id)?.name ?? "—";
}

function dash(v: string): string {
  return v.trim() === "" ? "—" : v;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-black/5 py-[2px]">
      <span className="text-black/45">{label}</span>
      <span className="text-right font-medium text-[#2b2f16]">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 break-inside-avoid">
      <div className="mb-1 border-b border-[var(--venue-primary)]/40 pb-[2px] text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--venue-primary)]">
        {title}
      </div>
      <div className="text-[9px] leading-tight">{children}</div>
    </div>
  );
}

export function StaffPdfDocument({
  value,
  departments,
  positions,
  statuses,
  nationalities,
  genders,
  civilStatuses,
  salaryPct,
  canViewSalary,
  venueName,
}: StaffPdfDocumentProps) {
  const inAccommodation = value.company_accommodation.toLowerCase() === "yes";
  const wage =
    value.wage_package.trim() === "" ? null : Number(value.wage_package);
  const breakdown = computeSalaryBreakdown(
    wage != null && Number.isFinite(wage) ? wage : null,
    inAccommodation,
    salaryPct,
  );
  const nationality = nationalities.find((n) => n.id === value.nationality_id);

  const generated = formatDateOnly(new Date());

  return (
    <div
      className="staff-print bg-white font-sans text-[#2b2f16]"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <div className="mx-auto w-[190mm]">
        {/* Header */}
        <div className="mb-3 flex items-end justify-between border-b-2 border-[var(--venue-primary)] pb-2">
          <div>
            <div className="font-serif text-[18px] leading-none text-[#3D421F]">
              {venueName}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-black/45">
              Employee Record
            </div>
          </div>
          <div className="text-right">
            <div className="font-serif text-[15px] leading-none text-[#3D421F]">
              {dash(value.full_name)}
            </div>
            <div className="mt-1 text-[10px] text-black/55">
              Emp no {dash(value.emp_no)}
            </div>
          </div>
        </div>

        {/* Three columns of sections */}
        <div className="grid grid-cols-3 gap-x-5">
          <div>
            <Section title="Identity">
              <Row label="Employee no" value={dash(value.emp_no)} />
              <Row label="First name" value={dash(value.first_name)} />
              <Row label="Last name" value={dash(value.last_name)} />
              <Row label="Full name" value={dash(value.full_name)} />
              <Row label="Gender" value={dash(value.gender)} />
              <Row label="Civil status" value={dash(value.civil_status)} />
              <Row label="Date of birth" value={formatDateOnly(value.dob)} />
              <Row
                label="Nationality"
                value={nationality?.name ?? "—"}
              />
            </Section>

            <Section title="Contact">
              <Row label="Phone" value={dash(value.contact_phone)} />
              <Row label="Personal email" value={dash(value.personal_email)} />
              <Row label="Work email" value={dash(value.work_email)} />
            </Section>
          </div>

          <div>
            <Section title="Roles & status">
              <Row
                label="Department"
                value={nameOf(departments, value.department_id)}
              />
              <Row
                label="Position"
                value={nameOf(positions, value.position_id)}
              />
              <Row
                label="Status"
                value={nameOf(statuses, value.employment_status_id)}
              />
              <Row
                label="Joining date"
                value={formatDateOnly(value.joining_date)}
              />
            </Section>

            {canViewSalary ? (
              <Section title="Compensation">
                <Row
                  label="Accommodation"
                  value={inAccommodation ? "Yes" : "No"}
                />
                <Row label="Wage package" value={formatAed(wage)} />
                <Row
                  label={`Basic ${salaryPct.basic}%`}
                  value={formatAed(breakdown.basic)}
                />
                <Row
                  label={`Accom. ${salaryPct.accom}%`}
                  value={formatAed(breakdown.accom)}
                />
                <Row
                  label={`Transport ${salaryPct.transp}%`}
                  value={formatAed(breakdown.transp)}
                />
                <Row
                  label="Salary to pay"
                  value={formatAed(breakdown.salaryToPay)}
                />
                <Row
                  label="Fly home / yr"
                  value={formatAed(nationality?.fly_home_ticket_value ?? null)}
                />
              </Section>
            ) : null}
          </div>

          <div>
            <Section title="Documents">
              <Row label="Passport no." value={dash(value.passport_no)} />
              <Row
                label="Passport expiry"
                value={formatDateOnly(value.passport_expiry)}
              />
              <Row label="EID no." value={dash(value.eid_no)} />
              <Row
                label="EID expiry"
                value={formatDateOnly(value.eid_expiry)}
              />
            </Section>

            <Section title="Bank details">
              <Row label="IBAN" value={dash(value.iban)} />
              <Row label="Swift code" value={dash(value.swift_code)} />
              <Row label="Bank name" value={dash(value.bank_name)} />
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-between border-t border-black/10 pt-1 text-[8px] text-black/40">
          <span>{venueName} · Human Resources</span>
          <span>Generated {generated}</span>
        </div>
      </div>
    </div>
  );
}
