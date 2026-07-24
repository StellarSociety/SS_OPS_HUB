"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveHrPayrollSettings } from "@/lib/actions/hr-payroll";
import type { HrPayrollSettings } from "@/lib/hr/payroll";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save payroll settings"}
    </Button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-black/45">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-black/10 pt-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="font-serif text-lg text-[#3D421F]">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-black/55">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PayrollSettingsForm({
  settings,
}: {
  settings: HrPayrollSettings;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-xl text-[#3D421F]">Payroll settings</h2>
      <p className="mt-1 text-sm text-black/55">
        Period window, payment date rules, WPS identifiers, and GL accounts for
        this venue.
      </p>

      <form action={saveHrPayrollSettings} className="mt-6 space-y-8">
        <Section
          title="Pay period"
          description="Attendance window used when building each named payroll month."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Period start day"
              hint="Day of month when the window opens (1–28)."
            >
              <Input
                type="number"
                name="period_start_day"
                min={1}
                max={28}
                defaultValue={settings.periodStartDay}
                className="h-8"
                required
              />
            </Field>
            <Field
              label="Period end day"
              hint="When less than start day, the window crosses months."
            >
              <Input
                type="number"
                name="period_end_day"
                min={1}
                max={28}
                defaultValue={settings.periodEndDay}
                className="h-8"
                required
              />
            </Field>
          </div>
        </Section>

        <Section title="Payment date">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment date rule">
              <select
                name="payment_date_rule"
                defaultValue={settings.paymentDateRule}
                className={lightSelectClass}
              >
                <option value="fixed_day">Fixed day of month</option>
                <option value="period_end">Period end</option>
                <option value="last_calendar_day">Last calendar day</option>
              </select>
            </Field>
            <Field
              label="Payment day of month"
              hint="Used when the rule is Fixed day of month."
            >
              <Input
                type="number"
                name="payment_day_of_month"
                min={1}
                max={31}
                defaultValue={settings.paymentDayOfMonth}
                className="h-8"
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Exclusions"
          description="Employment statuses excluded from new payroll runs (case-insensitive)."
        >
          <Field
            label="Exclude employment statuses"
            hint="Comma-separated, e.g. inactive, suspended, terminated"
          >
            <Input
              name="exclude_employment_statuses"
              defaultValue={settings.excludeEmploymentStatuses.join(", ")}
              className="h-8"
              placeholder="inactive, suspended, terminated"
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/35">
            <input
              type="checkbox"
              name="exclude_fully_unpaid_leave"
              defaultChecked={settings.excludeFullyUnpaidLeave}
              className="mt-0.5 h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
            />
            <span>Soft-exclude staff on fully unpaid leave for the period</span>
          </label>
        </Section>

        <Section title="WPS">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WPS employer ID">
              <Input
                name="wps_employer_id"
                defaultValue={settings.wpsEmployerId}
                className="h-8"
                autoComplete="off"
              />
            </Field>
            <Field label="WPS bank channel">
              <Input
                name="wps_bank_channel"
                defaultValue={settings.wpsBankChannel}
                className="h-8"
                autoComplete="off"
              />
            </Field>
          </div>
        </Section>

        <Section
          title="GL accounts"
          description="Used when exporting payroll journal lines."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["gl_basic_salary", "Basic salary", settings.glAccounts.basicSalary],
                ["gl_allowances", "Allowances", settings.glAccounts.allowances],
                ["gl_variables", "Variables", settings.glAccounts.variables],
                ["gl_deductions", "Deductions", settings.glAccounts.deductions],
                ["gl_net_payable", "Net payable", settings.glAccounts.netPayable],
                [
                  "gl_employer_cost",
                  "Employer cost",
                  settings.glAccounts.employerCost,
                ],
              ] as const
            ).map(([name, label, value]) => (
              <Field key={name} label={label}>
                <Input
                  name={name}
                  defaultValue={value}
                  className="h-8 font-mono text-xs"
                />
              </Field>
            ))}
          </div>
          <Field label="Default cost centre">
            <Input
              name="default_cost_centre"
              defaultValue={settings.defaultCostCentre}
              className="h-8"
            />
          </Field>
        </Section>

        <SaveButton />
      </form>
    </div>
  );
}
