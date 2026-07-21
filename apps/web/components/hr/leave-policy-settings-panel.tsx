"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveHrLeavePolicySettings } from "@/lib/actions/hr-leave";
import { HR_SETTINGS_ATTENDANCE_ATTENDANCE_HREF } from "@/lib/hr/settings-nav";
import type {
  HrLeavePaidStatus,
  HrLeavePolicySettings,
  HrLeaveTypeConfig,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save leave policy"}
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

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/35">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
      />
      <span>{label}</span>
    </label>
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

const PAID_STATUS_OPTIONS: { value: HrLeavePaidStatus; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "half_pay", label: "Half pay" },
  { value: "unpaid", label: "Unpaid" },
  { value: "variable", label: "Variable" },
  { value: "paid_plus_compensation", label: "Extra day given" },
];

export function LeavePolicySettingsPanel({
  settings,
}: {
  settings: HrLeavePolicySettings;
}) {
  const [leaveTypes, setLeaveTypes] = useState<HrLeaveTypeConfig[]>(
    () => settings.leaveTypes,
  );

  const leaveTypesJson = useMemo(
    () => JSON.stringify(leaveTypes),
    [leaveTypes],
  );

  function updateType(index: number, patch: Partial<HrLeaveTypeConfig>) {
    setLeaveTypes((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-xl text-[#3D421F]">Leave Policy</h2>
        <p className="mt-1 text-sm text-black/55">
          Venue rules for UAE private-sector leave. Leave years follow the
          calendar year (1 Jan–31 Dec). Public holidays are managed separately.
        </p>

        <form action={saveHrLeavePolicySettings} className="mt-6 space-y-8">
          <input type="hidden" name="leave_types_json" value={leaveTypesJson} />

          <Section
            title="Leave types"
            description="Codes used on the roster, balances, and future requests. PH-W is automatic: a SHIFT on a public holiday day (from Attendance settings) accrues +1 to PH-REPL."
          >
            <div className="overflow-x-auto rounded-lg border border-black/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Label</th>
                    <th className="px-3 py-2.5 font-medium">Paid status</th>
                    <th className="px-3 py-2.5 font-medium text-center">
                      Balance
                    </th>
                    <th className="px-3 py-2.5 font-medium text-center">
                      Active
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 bg-white">
                  {leaveTypes.map((row, index) => {
                    const isAutoPhWorked = row.code === "PH-W";
                    return (
                    <tr
                      key={row.code}
                      className={
                        isAutoPhWorked
                          ? "bg-[var(--venue-secondary,#F0F3DD)]/35"
                          : undefined
                      }
                    >
                      <td className="px-3 py-2 font-mono text-xs text-[#3D421F]">
                        {row.code}
                      </td>
                      <td className="px-3 py-2">
                        {isAutoPhWorked ? (
                          <div className="space-y-0.5">
                            <p className="text-sm text-[#3D421F]">
                              {row.name}
                            </p>
                            <p className="text-xs text-black/45">
                              Auto when roster is SHIFT on a public holiday
                              date.
                            </p>
                          </div>
                        ) : (
                          <Input
                            value={row.name}
                            onChange={(e) =>
                              updateType(index, { name: e.target.value })
                            }
                            className="h-8 min-w-[10rem]"
                            aria-label={`${row.code} name`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isAutoPhWorked ? (
                          <span className="font-mono text-xs text-[#3D421F]">
                            {row.displayLabel}
                          </span>
                        ) : (
                          <Input
                            value={row.displayLabel}
                            onChange={(e) =>
                              updateType(index, {
                                displayLabel: e.target.value,
                              })
                            }
                            className="h-8 w-20"
                            aria-label={`${row.code} label`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isAutoPhWorked ? (
                          <span className="text-sm text-[#3D421F]">
                            Extra day given
                          </span>
                        ) : (
                          <select
                            value={row.paidStatus}
                            onChange={(e) =>
                              updateType(index, {
                                paidStatus: e.target.value as HrLeavePaidStatus,
                              })
                            }
                            className={lightSelectClass}
                            aria-label={`${row.code} paid status`}
                          >
                            {PAID_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.balanceRequired}
                          disabled={isAutoPhWorked}
                          onChange={(e) =>
                            updateType(index, {
                              balanceRequired: e.target.checked,
                            })
                          }
                          className="h-4 w-4 accent-[var(--venue-primary,#818a40)] disabled:opacity-40"
                          aria-label={`${row.code} requires balance`}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.active}
                          onChange={(e) =>
                            updateType(index, { active: e.target.checked })
                          }
                          className="h-4 w-4 accent-[var(--venue-primary,#818a40)]"
                          aria-label={`${row.code} active`}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Annual leave"
            description="Statutory accrual. Defaults match UAE private-sector rules."
          >
            <div className="mb-4 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-4 py-3">
              <Label htmlFor="annual_partial_month_method">
                Partial months (before 1 year of service)
              </Label>
              <p className="mt-1 text-xs text-black/55">
                Controls how incomplete months count toward AL for staff with
                under 12 months of service. Employees with a termination date
                always use pro-rata through that last day.
              </p>
              <select
                id="annual_partial_month_method"
                name="annual_partial_month_method"
                defaultValue={
                  settings.annual.partialMonthMethod ?? "full_months"
                }
                className={cn(lightSelectClass, "mt-2 max-w-md")}
              >
                <option value="full_months">
                  Full months only (e.g. 9 months × 2 = 18)
                </option>
                <option value="pro_rata">
                  Pro-rata — include partial month (e.g. 9.6 × 2 ≈ 19)
                </option>
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="No entitlement through (months)"
                hint="Completed months with 0 statutory AL."
              >
                <Input
                  name="annual_zero_entitlement_months"
                  type="number"
                  min={0}
                  defaultValue={settings.annual.zeroEntitlementMonths}
                />
              </Field>
              <Field
                label="Days per month (before 1 year)"
                hint="After the zero period, before 12 months."
              >
                <Input
                  name="annual_days_per_month_before_year"
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={settings.annual.daysPerMonthBeforeYear}
                />
              </Field>
              <Field label="Annual days after 1 year">
                <Input
                  name="annual_days_after_year"
                  type="number"
                  min={0}
                  defaultValue={settings.annual.annualDaysAfterYear}
                />
              </Field>
              <Field label="Monthly accrual after 1 year">
                <Input
                  name="annual_monthly_accrual_after_year"
                  type="number"
                  min={0}
                  step={0.1}
                  defaultValue={settings.annual.monthlyAccrualAfterYear}
                />
              </Field>
              <Field
                label="Carry-forward max (days)"
                hint="Max unused AL / PH-REPL days that roll into the next year. 0 disables auto carry-forward."
              >
                <Input
                  name="annual_carry_forward_max_days"
                  type="number"
                  min={0}
                  defaultValue={settings.annual.carryForwardMaxDays}
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Toggle
                name="annual_calendar_day_calculation"
                label="Count annual leave in calendar days"
                defaultChecked={settings.annual.calendarDayCalculation}
              />
              <Toggle
                name="annual_allow_negative_balance"
                label="Allow negative annual leave balance"
                defaultChecked={settings.annual.allowNegativeBalance}
              />
              <Toggle
                name="annual_allow_hr_override"
                label="Allow HR to grant annual leave before statutory entitlement"
                defaultChecked={settings.annual.allowHrOverride}
              />
            </div>
          </Section>

          <Section
            title="Sick leave"
            description="90-day yearly allowance after probation: full pay, then half pay, then unpaid."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Full-pay days">
                <Input
                  name="sick_full_pay_days"
                  type="number"
                  min={0}
                  defaultValue={settings.sick.fullPayDays}
                />
              </Field>
              <Field label="Half-pay days">
                <Input
                  name="sick_half_pay_days"
                  type="number"
                  min={0}
                  defaultValue={settings.sick.halfPayDays}
                />
              </Field>
              <Field label="Unpaid days">
                <Input
                  name="sick_unpaid_days"
                  type="number"
                  min={0}
                  defaultValue={settings.sick.unpaidDays}
                />
              </Field>
              <Field label="Yearly maximum">
                <Input
                  name="sick_yearly_maximum_days"
                  type="number"
                  min={0}
                  defaultValue={settings.sick.yearlyMaximumDays}
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Toggle
                name="sick_unpaid_during_probation"
                label="During probation, sick leave is unpaid only"
                defaultChecked={settings.sick.unpaidDuringProbation}
              />
              <Toggle
                name="sick_require_medical_certificate"
                label="Require medical certificate"
                defaultChecked={settings.sick.requireMedicalCertificate}
              />
            </div>
          </Section>

          <Section title="Other leave entitlements">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Parental leave (working days)">
                <Input
                  name="other_parental_working_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.parentalWorkingDays}
                />
              </Field>
              <Field label="Bereavement — spouse (days)">
                <Input
                  name="other_bereavement_spouse_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.bereavementSpouseDays}
                />
              </Field>
              <Field label="Bereavement — close family (days)">
                <Input
                  name="other_bereavement_close_family_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.bereavementCloseFamilyDays}
                />
              </Field>
              <Field label="Study leave (working days / year)">
                <Input
                  name="other_study_leave_working_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.studyLeaveWorkingDays}
                />
              </Field>
              <Field label="Study leave min service (years)">
                <Input
                  name="other_study_leave_min_service_years"
                  type="number"
                  min={0}
                  defaultValue={settings.other.studyLeaveMinServiceYears}
                />
              </Field>
              <Field label="Hajj leave (calendar days)">
                <Input
                  name="other_hajj_leave_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.hajjLeaveDays}
                />
              </Field>
              <Field label="Maternity full pay (days)">
                <Input
                  name="other_maternity_full_pay_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.maternityFullPayDays}
                />
              </Field>
              <Field label="Maternity half pay (days)">
                <Input
                  name="other_maternity_half_pay_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.maternityHalfPayDays}
                />
              </Field>
              <Field label="Maternity unpaid extra (days)">
                <Input
                  name="other_maternity_unpaid_extra_days"
                  type="number"
                  min={0}
                  defaultValue={settings.other.maternityUnpaidExtraDays}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Toggle
                name="other_hajj_once_per_employment"
                label="Hajj leave only once per employment"
                defaultChecked={settings.other.hajjOncePerEmployment}
              />
            </div>
          </Section>

          <Section
            title="Approvals & general"
            description="Stored now; enforced when leave requests go live."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle
                name="approvals_employee_submits"
                label="Employee submits requests"
                defaultChecked={settings.approvals.employeeSubmits}
              />
              <Toggle
                name="approvals_manager_reviews"
                label="Manager reviews"
                defaultChecked={settings.approvals.managerReviews}
              />
              <Toggle
                name="approvals_hr_reviews_when_required"
                label="HR reviews when required"
                defaultChecked={settings.approvals.hrReviewsWhenRequired}
              />
              <Toggle
                name="approvals_allow_hr_override"
                label="Allow HR override"
                defaultChecked={settings.approvals.allowHrOverride}
              />
              <Toggle
                name="approvals_allow_roster_created_leave"
                label="Allow leave created from the roster"
                defaultChecked={settings.approvals.allowRosterCreatedLeave}
              />
              <Toggle
                name="approvals_allow_backdated_requests"
                label="Allow backdated requests"
                defaultChecked={settings.approvals.allowBackdatedRequests}
              />
              <Toggle
                name="approvals_require_supporting_document"
                label="Require supporting document by default"
                defaultChecked={settings.approvals.requireSupportingDocument}
              />
              <Toggle
                name="approvals_notify_on_submit"
                label="Notify on submit"
                defaultChecked={settings.approvals.notifyOnSubmit}
              />
              <Toggle
                name="approvals_notify_on_decision"
                label="Notify on decision"
                defaultChecked={settings.approvals.notifyOnDecision}
              />
            </div>
          </Section>

          <div className="flex flex-wrap items-center gap-3 border-t border-black/10 pt-4">
            <SaveButton />
            <p className="text-xs text-black/45">
              Changes apply to new balance seeding and future request rules.
            </p>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <h3 className="font-serif text-lg text-[#3D421F]">Public holidays</h3>
        <p className="mt-1 text-sm text-black/55">
          Holiday dates are managed under Attendance settings. When someone is
          rostered as SHIFT on one of those days, PH-REPL accrues automatically
          (+1 per worked holiday). Marking the day as PH (taken) does not
          accrue.
        </p>
        <Link
          href={HR_SETTINGS_ATTENDANCE_ATTENDANCE_HREF}
          className="mt-3 inline-flex text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
        >
          Open public holidays settings
        </Link>
      </div>
    </div>
  );
}
