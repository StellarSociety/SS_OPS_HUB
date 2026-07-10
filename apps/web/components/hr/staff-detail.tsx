"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeAge,
  computeVacationBalance,
  computeWorkedTime,
  formatAed,
  formatDateOnly,
} from "@/lib/hr/derived";
import type {
  Department,
  EmploymentStatus,
  Nationality,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import { updateStaff } from "@/lib/actions/hr";

type StaffDetailViewProps = {
  staff: StaffWithLookups;
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  canEdit: boolean;
  canViewSalary: boolean;
};

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-black/45">{label}</dt>
      <dd className="mt-0.5 text-sm text-[#3D421F]">{value ?? "—"}</dd>
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
    <section className="rounded-lg border border-black/10 bg-white p-5">
      <h2 className="mb-4 font-serif text-lg text-[#3D421F]">{title}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

export function StaffDetailView({
  staff,
  departments,
  positions,
  statuses,
  nationalities,
  canEdit,
  canViewSalary,
}: StaffDetailViewProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = computeAge(staff.dob);
  const worked = computeWorkedTime(staff.joining_date, staff.termination_date);
  const vacationBalance = computeVacationBalance(
    staff.vacations_entitle,
    staff.vacations_balance,
    staff.unpaid_leave_days_total,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateStaff(staff.id, new FormData(e.currentTarget));
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      setEditing(false);
    }
  }

  if (editing && canEdit) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <Section title="Identity & details">
          <div>
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={staff.full_name}
              required
            />
          </div>
          <div>
            <Label htmlFor="first_name">First name</Label>
            <Input
              id="first_name"
              name="first_name"
              defaultValue={staff.first_name ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="last_name">Last name</Label>
            <Input
              id="last_name"
              name="last_name"
              defaultValue={staff.last_name ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="department_id">Department</Label>
            <select
              id="department_id"
              name="department_id"
              defaultValue={staff.department_id ?? ""}
              className="h-10 w-full rounded-md border border-black/10 px-3 text-sm"
            >
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="employment_status_id">Status</Label>
            <select
              id="employment_status_id"
              name="employment_status_id"
              defaultValue={staff.employment_status_id ?? ""}
              className="h-10 w-full rounded-md border border-black/10 px-3 text-sm"
            >
              <option value="">—</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="nationality_id">Nationality</Label>
            <select
              id="nationality_id"
              name="nationality_id"
              defaultValue={staff.nationality_id ?? ""}
              className="h-10 w-full rounded-md border border-black/10 px-3 text-sm"
            >
              <option value="">—</option>
              {nationalities.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="contact_phone">Phone</Label>
            <Input
              id="contact_phone"
              name="contact_phone"
              defaultValue={staff.contact_phone ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="work_email">Work email</Label>
            <Input
              id="work_email"
              name="work_email"
              type="email"
              defaultValue={staff.work_email ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="personal_email">Personal email</Label>
            <Input
              id="personal_email"
              name="personal_email"
              type="email"
              defaultValue={staff.personal_email ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="gender">Gender</Label>
            <Input id="gender" name="gender" defaultValue={staff.gender ?? ""} />
          </div>
          <div>
            <Label htmlFor="civil_status">Civil status</Label>
            <Input
              id="civil_status"
              name="civil_status"
              defaultValue={staff.civil_status ?? ""}
            />
          </div>
          {canViewSalary ? (
            <div>
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                name="dob"
                type="date"
                defaultValue={staff.dob ?? ""}
              />
            </div>
          ) : null}
        </Section>

        {canViewSalary ? (
          <>
            <Section title="Documents">
              <div>
                <Label htmlFor="passport_no">Passport no</Label>
                <Input
                  id="passport_no"
                  name="passport_no"
                  defaultValue={staff.passport_no ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="passport_expiry">Passport expiry</Label>
                <Input
                  id="passport_expiry"
                  name="passport_expiry"
                  type="date"
                  defaultValue={staff.passport_expiry ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="eid_no">EID no</Label>
                <Input id="eid_no" name="eid_no" defaultValue={staff.eid_no ?? ""} />
              </div>
              <div>
                <Label htmlFor="eid_expiry">EID expiry</Label>
                <Input
                  id="eid_expiry"
                  name="eid_expiry"
                  type="date"
                  defaultValue={staff.eid_expiry ?? ""}
                />
              </div>
            </Section>

            <Section title="Bank details">
              <div>
                <Label htmlFor="iban">IBAN</Label>
                <Input id="iban" name="iban" defaultValue={staff.iban ?? ""} />
              </div>
              <div>
                <Label htmlFor="swift_code">SWIFT</Label>
                <Input
                  id="swift_code"
                  name="swift_code"
                  defaultValue={staff.swift_code ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="bank_name">Bank</Label>
                <Input
                  id="bank_name"
                  name="bank_name"
                  defaultValue={staff.bank_name ?? ""}
                />
              </div>
            </Section>
          </>
        ) : null}

        <Section title="Joining & leave">
          <div>
            <Label htmlFor="position_id">Position</Label>
            <select
              id="position_id"
              name="position_id"
              defaultValue={staff.position_id ?? ""}
              className="h-10 w-full rounded-md border border-black/10 px-3 text-sm"
            >
              <option value="">—</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="joining_date">Joining date</Label>
            <Input
              id="joining_date"
              name="joining_date"
              type="date"
              defaultValue={staff.joining_date ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="termination_date">Termination date</Label>
            <Input
              id="termination_date"
              name="termination_date"
              type="date"
              defaultValue={staff.termination_date ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="vacations_entitle">Vacations entitled</Label>
            <Input
              id="vacations_entitle"
              name="vacations_entitle"
              type="number"
              step="0.5"
              defaultValue={staff.vacations_entitle ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="vacations_balance">Vacations balance</Label>
            <Input
              id="vacations_balance"
              name="vacations_balance"
              type="number"
              step="0.5"
              defaultValue={staff.vacations_balance ?? ""}
            />
          </div>
        </Section>

        {canViewSalary ? (
          <Section title="Salary package (AED)">
            <div>
              <Label htmlFor="wage_package">Wage package</Label>
              <Input
                id="wage_package"
                name="wage_package"
                type="number"
                defaultValue={staff.wage_package ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="basic_salary_60">Basic 60%</Label>
              <Input
                id="basic_salary_60"
                name="basic_salary_60"
                type="number"
                defaultValue={staff.basic_salary_60 ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="accom_all_25">Accom 25%</Label>
              <Input
                id="accom_all_25"
                name="accom_all_25"
                type="number"
                defaultValue={staff.accom_all_25 ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="transp_all_15">Transport 15%</Label>
              <Input
                id="transp_all_15"
                name="transp_all_15"
                type="number"
                defaultValue={staff.transp_all_15 ?? ""}
              />
            </div>
          </Section>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        </div>
      ) : null}

      <Section title="Identity & details">
        <Field label="Emp no" value={staff.emp_no} />
        <Field label="Full name" value={staff.full_name} />
        <Field label="Department" value={staff.department?.name} />
        <Field label="Status" value={staff.employment_status?.name} />
        <Field label="Nationality" value={staff.nationality?.name} />
        <Field label="Phone" value={staff.contact_phone} />
        <Field label="Work email" value={staff.work_email} />
        <Field label="Personal email" value={staff.personal_email} />
        <Field label="Gender" value={staff.gender} />
        <Field label="Civil status" value={staff.civil_status} />
        {canViewSalary ? (
          <>
            <Field label="Date of birth" value={formatDateOnly(staff.dob)} />
            <Field label="Age" value={age != null ? `${age} years` : "—"} />
          </>
        ) : (
          <Field label="Date of birth" value="Restricted" />
        )}
      </Section>

      {canViewSalary ? (
        <>
          <Section title="Documents">
            <Field label="Passport no" value={staff.passport_no} />
            <Field
              label="Passport expiry"
              value={formatDateOnly(staff.passport_expiry)}
            />
            <Field label="EID no" value={staff.eid_no} />
            <Field label="EID expiry" value={formatDateOnly(staff.eid_expiry)} />
          </Section>

          <Section title="Bank details">
            <Field label="IBAN" value={staff.iban} />
            <Field label="SWIFT" value={staff.swift_code} />
            <Field label="Bank" value={staff.bank_name} />
          </Section>
        </>
      ) : null}

      <Section title="Joining & leave">
        <Field label="Position" value={staff.position?.name} />
        <Field label="Joining date" value={formatDateOnly(staff.joining_date)} />
        <Field
          label="Termination date"
          value={formatDateOnly(staff.termination_date)}
        />
        <Field label="Worked time" value={worked} />
        <Field
          label="Unpaid leave (total days)"
          value={staff.unpaid_leave_days_total}
        />
        <Field label="Vacations entitled" value={staff.vacations_entitle} />
        <Field label="Vacations balance" value={vacationBalance} />
      </Section>

      {canViewSalary ? (
        <>
          <Section title="Salary package (AED)">
            <Field label="Wage package" value={formatAed(staff.wage_package)} />
            <Field
              label="Company accommodation"
              value={staff.company_accommodation}
            />
            <Field label="Basic 60%" value={formatAed(staff.basic_salary_60)} />
            <Field label="Accom 25%" value={formatAed(staff.accom_all_25)} />
            <Field label="Transport 15%" value={formatAed(staff.transp_all_15)} />
            <Field
              label="Fly-home ticket / year"
              value={formatAed(staff.fly_home_ticket_per_year)}
            />
          </Section>

          <Section title="Expenses">
            <Field
              label="Provisional leave"
              value={formatAed(staff.provisional_leave)}
            />
            <Field label="Provisional EOSB" value={formatAed(staff.provisional_eosb)} />
            <Field label="Visa expenses" value={formatAed(staff.visa_expenses)} />
            <Field
              label="Visa penalties paid"
              value={formatAed(staff.visa_penalties_paid)}
            />
          </Section>
        </>
      ) : null}

      <Section title="OHC & trainings">
        <Field label="OHC date" value={formatDateOnly(staff.ohc_date)} />
        <Field label="PIC date" value={formatDateOnly(staff.pic_date)} />
        <Field
          label="Basic food safety"
          value={formatDateOnly(staff.basic_food_safety_date)}
        />
        <Field label="Fire safety" value={formatDateOnly(staff.fire_safety_date)} />
        <Field label="First aid" value={formatDateOnly(staff.first_aid_date)} />
      </Section>

      <Section title="Insurance">
        <Field label="Category" value={staff.insurance_category} />
        {canViewSalary ? (
          <Field
            label="Medical insurance value"
            value={formatAed(staff.medical_insurance_value)}
          />
        ) : null}
        <Field
          label="Issue date"
          value={formatDateOnly(staff.medical_insurance_issue_date)}
        />
        <Field
          label="Expiry date"
          value={formatDateOnly(staff.medical_insurance_expiry_date)}
        />
      </Section>
    </div>
  );
}
