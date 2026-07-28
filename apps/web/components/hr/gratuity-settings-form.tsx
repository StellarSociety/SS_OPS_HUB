"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  BenefitsPercentTotalBadge,
  BenefitsSettingsEditor,
  benefitsListInputClass,
} from "@/components/hr/benefits-settings-editor";
import {
  BenefitsPointTiersEditor,
  type BenefitsPositionOption,
} from "@/components/hr/benefits-point-tiers-editor";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveHrGratuitySettings } from "@/lib/actions/hr-benefits";
import type {
  BenefitDepartmentShare,
  BenefitPointTier,
  GratuityDisciplinaryDeduction,
  HrGratuitySettings,
} from "@/lib/hr/benefits";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save gratuity settings"}
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
    <section className="space-y-4 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/45 p-4">
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

function CheckboxRow({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-[#3D421F]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-black/20"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-black/45">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

export function GratuitySettingsForm({
  settings,
  positions = [],
}: {
  settings: HrGratuitySettings;
  positions?: BenefitsPositionOption[];
}) {
  const [tipOutMode, setTipOutMode] = useState(settings.waiterCcTipOutMode);
  const [departments, setDepartments] = useState<BenefitDepartmentShare[]>(
    settings.departmentShares,
  );
  const [tiers, setTiers] = useState<BenefitPointTier[]>(settings.pointTiers);
  const [disciplinary, setDisciplinary] = useState<
    GratuityDisciplinaryDeduction[]
  >(settings.disciplinaryDeductions);

  const deptJson = useMemo(() => JSON.stringify(departments), [departments]);
  const tiersJson = useMemo(() => JSON.stringify(tiers), [tiers]);
  const discJson = useMemo(() => JSON.stringify(disciplinary), [disciplinary]);

  const deptTotal = departments.reduce((s, d) => s + Number(d.percent || 0), 0);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-xl text-[#3D421F]">Gratuity policy</h2>
      <p className="mt-1 text-sm text-black/55">
        Tip collection, tip-out, general pool, points, and disciplinary rules
        for this venue. Defaults follow the Orilla tips SOP; adjust when
        practice changes (e.g. ASPH tip-out on hold → collection %).
      </p>

      <GuardedSettingsForm
        action={saveHrGratuitySettings}
        className="mt-6 space-y-3"
        watch={{ tipOutMode, deptJson, tiersJson, discJson }}
      >
        <input type="hidden" name="department_shares_json" value={deptJson} />
        <input type="hidden" name="point_tiers_json" value={tiersJson} />
        <input type="hidden" name="disciplinary_json" value={discJson} />

        <Section
          title="Period & distribution"
          description="Tips are calculated for the named month and paid on the configured distribution day."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Period mode"
              hint="Calendar month matches the SOP. Payroll period reuses Pay → Period & Payment window."
            >
              <select
                name="period_mode"
                defaultValue={settings.periodMode}
                className={lightSelectClass}
              >
                <option value="calendar_month">Calendar month</option>
                <option value="payroll_period">Payroll period</option>
              </select>
            </Field>
            <Field label="Distribution day of month" hint="SOP default: 15.">
              <Input
                type="number"
                name="distribution_day_of_month"
                min={1}
                max={28}
                defaultValue={settings.distributionDayOfMonth}
                className="h-8"
                required
              />
            </Field>
            <Field
              label="Distribution month offset"
              hint="1 = following month (SOP). 0 = same month."
            >
              <Input
                type="number"
                name="distribution_month_offset"
                min={0}
                max={3}
                defaultValue={settings.distributionMonthOffset}
                className="h-8"
                required
              />
            </Field>
            <Field label="Period start day">
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
            <Field label="Period end day">
              <Input
                type="number"
                name="period_end_day"
                min={1}
                max={31}
                defaultValue={settings.periodEndDay}
                className="h-8"
                required
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Cash tips — waiters"
          description="Cash tips collected by waiters are split between the waiter and the general tips pool."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Waiter retain %" hint="SOP: 70%.">
              <Input
                type="number"
                step="0.1"
                name="waiter_cash_retain_percent"
                defaultValue={settings.waiterCashRetainPercent}
                className="h-8"
                required
              />
            </Field>
            <Field label="General pool %" hint="SOP: 30%.">
              <Input
                type="number"
                step="0.1"
                name="waiter_cash_pool_percent"
                defaultValue={settings.waiterCashPoolPercent}
                className="h-8"
                required
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Credit card tips — waiters"
          description="Tip-out feeds the general pool. Choose ASPH KPI rates or a flat % of each waiter's CC tip collection (current practice while ASPH is on hold)."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tip-out mode">
              <select
                name="waiter_cc_tip_out_mode"
                value={tipOutMode}
                onChange={(e) =>
                  setTipOutMode(
                    e.target.value as HrGratuitySettings["waiterCcTipOutMode"],
                  )
                }
                className={lightSelectClass}
              >
                <option value="collection_percent">
                  % of waiter CC tip collection
                </option>
                <option value="asph_kpi">
                  % of individual gross sales (ASPH KPI)
                </option>
              </select>
            </Field>
            <Field
              label="Collection tip-out %"
              hint="Used when mode is collection %. Current: 30%."
            >
              <Input
                type="number"
                step="0.1"
                name="waiter_cc_collection_tip_out_percent"
                defaultValue={settings.waiterCcCollectionTipOutPercent}
                className="h-8"
                disabled={tipOutMode !== "collection_percent"}
              />
            </Field>
            <Field
              label="Tip-out % when KPI met"
              hint="SOP: 1.5% of individual gross sales."
            >
              <Input
                type="number"
                step="0.01"
                name="waiter_cc_tip_out_pct_when_kpi_met"
                defaultValue={settings.waiterCcTipOutPctWhenKpiMet}
                className="h-8"
                disabled={tipOutMode !== "asph_kpi"}
              />
            </Field>
            <Field
              label="Tip-out % when KPI missed"
              hint="SOP: 2% of individual gross sales."
            >
              <Input
                type="number"
                step="0.01"
                name="waiter_cc_tip_out_pct_when_kpi_missed"
                defaultValue={settings.waiterCcTipOutPctWhenKpiMissed}
                className="h-8"
                disabled={tipOutMode !== "asph_kpi"}
              />
            </Field>
            <Field
              label="Runner / housekeeper deduct %"
              hint="Of retained CC balance after tip-out. SOP: 3%."
            >
              <Input
                type="number"
                step="0.1"
                name="runner_housekeeper_deduct_percent"
                defaultValue={settings.runnerHousekeeperDeductPercent}
                className="h-8"
                required
              />
            </Field>
          </div>
          <CheckboxRow
            name="asph_kpi_enabled"
            defaultChecked={settings.asphKpiEnabled}
            label="ASPH KPI active"
            hint="When off, even ASPH mode can be staged without enforcing KPI thresholds."
          />
        </Section>

        <Section
          title="General tips pool"
          description="Deductions before departmental redistribution."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="OS&E / breakages %" hint="SOP: 2%.">
              <Input
                type="number"
                step="0.1"
                name="pool_ose_deduct_percent"
                defaultValue={settings.poolOseDeductPercent}
                className="h-8"
                required
              />
            </Field>
            <Field label="Staff activities %" hint="SOP: 1%.">
              <Input
                type="number"
                step="0.1"
                name="pool_staff_activities_deduct_percent"
                defaultValue={settings.poolStaffActivitiesDeductPercent}
                className="h-8"
                required
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Departmental redistribution"
          description="Share of the remaining pool after OS&E and activities deductions. Adjust when headcount shifts."
        >
          <BenefitsSettingsEditor
            columns={[
              { key: "label", label: "Department" },
              { key: "percent", label: "Share %", className: "text-right" },
            ]}
            rows={departments.map((dept, index) => ({
              id: dept.key || `dept-${index}`,
              cells: [
                <Input
                  key="label"
                  value={dept.label}
                  onChange={(e) => {
                    const next = [...departments];
                    next[index] = { ...dept, label: e.target.value };
                    setDepartments(next);
                  }}
                  className={benefitsListInputClass()}
                  aria-label="Department label"
                />,
                <Input
                  key="percent"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={dept.percent}
                  onChange={(e) => {
                    const next = [...departments];
                    next[index] = {
                      ...dept,
                      percent: Number(e.target.value) || 0,
                    };
                    setDepartments(next);
                  }}
                  className={benefitsListInputClass("text-right tabular-nums")}
                  aria-label={`${dept.label} percent`}
                />,
              ],
            }))}
            onRemove={(index) =>
              setDepartments(departments.filter((_, i) => i !== index))
            }
            canRemove={() => departments.length > 1}
            onAdd={() =>
              setDepartments([
                ...departments,
                {
                  key: `dept_${departments.length + 1}`,
                  label: "New department",
                  percent: 0,
                },
              ])
            }
            addLabel="Add department"
            footer={<BenefitsPercentTotalBadge total={deptTotal} />}
          />
        </Section>

        <Section
          title="Points system"
          description="Assign HR positions to each tier. Staff inherit the tier points during pool distribution."
        >
          <BenefitsPointTiersEditor
            tiers={tiers}
            onChange={setTiers}
            positions={positions}
          />
        </Section>

        <Section
          title="Worked days"
          description="Only actual worked days count toward distribution weight."
        >
          <div className="space-y-2">
            <CheckboxRow
              name="include_regular_days_off"
              defaultChecked={settings.includeRegularDaysOffInWorkedDays}
              label="Include regular days off"
              hint="SOP: included."
            />
            <CheckboxRow
              name="include_public_holidays"
              defaultChecked={settings.includePublicHolidaysInWorkedDays}
              label="Include public holidays"
              hint="SOP: included."
            />
            <CheckboxRow
              name="exclude_leave"
              defaultChecked={settings.excludeLeaveFromWorkedDays}
              label="Exclude leave days"
              hint="Vacation, annual, unpaid, sick leave excluded."
            />
          </div>
        </Section>

        <Section
          title="Disciplinary deductions"
          description="Active warning levels reduce tip entitlement. HR may override per hearing."
        >
          <BenefitsSettingsEditor
            columns={[
              { key: "label", label: "Warning level" },
              { key: "percent", label: "Deduct %", className: "text-right" },
            ]}
            rows={disciplinary.map((row, index) => ({
              id: row.level,
              cells: [
                <Input
                  key="label"
                  value={row.label}
                  onChange={(e) => {
                    const next = [...disciplinary];
                    next[index] = { ...row, label: e.target.value };
                    setDisciplinary(next);
                  }}
                  className={benefitsListInputClass()}
                />,
                <Input
                  key="percent"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={row.percent}
                  onChange={(e) => {
                    const next = [...disciplinary];
                    next[index] = {
                      ...row,
                      percent: Number(e.target.value) || 0,
                    };
                    setDisciplinary(next);
                  }}
                  className={benefitsListInputClass("text-right tabular-nums")}
                />,
              ],
            }))}
          />
        </Section>

        <Section
          title="Bar tips"
          description="Cash bar tips and credit card bar tip split."
        >
          <div className="space-y-3">
            <CheckboxRow
              name="bar_cash_equal_split"
              defaultChecked={settings.barCashEqualSplit}
              label="Split bar cash tips equally among bar staff"
              hint="SOP: weekly equal split; settlement still lands in monthly runs."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bar CC → general pool %" hint="SOP: 50%.">
                <Input
                  type="number"
                  step="0.1"
                  name="bar_cc_pool_percent"
                  defaultValue={settings.barCcPoolPercent}
                  className="h-8"
                  required
                />
              </Field>
              <Field label="Bar CC → bar staff %" hint="SOP: 50%.">
                <Input
                  type="number"
                  step="0.1"
                  name="bar_cc_bar_staff_percent"
                  defaultValue={settings.barCcBarStaffPercent}
                  className="h-8"
                  required
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section
          title="Special cases — resignation & termination"
          description="Venue-wide policy when a staff member's termination type is set on their profile (Staff → Employment, after termination date)."
        >
          <div className="space-y-2">
            <CheckboxRow
              name="resignation_entitled"
              defaultChecked={settings.resignationEntitled}
              label="Resignation: entitled for period worked"
            />
            <CheckboxRow
              name="termination_entitled"
              defaultChecked={settings.terminationEntitled}
              label="Termination: entitled to tips"
              hint="SOP: not entitled. Leave unchecked."
            />
          </div>
        </Section>

        <Section title="Notes">
          <textarea
            name="notes"
            defaultValue={settings.notes}
            rows={3}
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
            placeholder="Optional venue-specific notes for auditors / accounts."
          />
        </Section>

        <div className="flex justify-end border-t border-black/10 pt-4">
          <SaveButton />
        </div>
      </GuardedSettingsForm>
    </div>
  );
}
