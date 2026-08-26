"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
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
import { saveHrServiceChargeSettings } from "@/lib/actions/hr-benefits";
import type {
  BenefitPointTier,
  GratuityDisciplinaryDeduction,
  HrServiceChargeSettings,
} from "@/lib/hr/benefits";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save service charge settings"}
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

export function ServiceChargeSettingsForm({
  settings,
  positions = [],
}: {
  settings: HrServiceChargeSettings;
  positions?: BenefitsPositionOption[];
}) {
  const [tiers, setTiers] = useState<BenefitPointTier[]>(settings.pointTiers);
  const [disciplinary, setDisciplinary] = useState<
    GratuityDisciplinaryDeduction[]
  >(settings.disciplinaryDeductions);

  const tiersJson = useMemo(() => JSON.stringify(tiers), [tiers]);
  const discJson = useMemo(() => JSON.stringify(disciplinary), [disciplinary]);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-xl text-[#3D421F]">
        Service charge policy
      </h2>
      <p className="mt-1 text-sm text-black/55">
        Distribution rules for service charge settlements.{" "}
        {settings.staffDistributablePercent}% of collections is paid to staff by
        points × worked days, less any disciplinary deduction; the rest is held
        for venue expenses.
      </p>

      <GuardedSettingsForm
        action={saveHrServiceChargeSettings}
        className="mt-6 space-y-3"
        watch={{ tiersJson, discJson }}
      >
        <input type="hidden" name="point_tiers_json" value={tiersJson} />
        <input type="hidden" name="disciplinary_json" value={discJson} />

        <Section title="Period & distribution">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Period mode">
              <select
                name="period_mode"
                defaultValue={settings.periodMode}
                className={lightSelectClass}
              >
                <option value="calendar_month">Calendar month</option>
                <option value="payroll_period">Payroll period</option>
              </select>
            </Field>
            <Field label="Distribution day of month">
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
            <Field label="Distribution month offset">
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
          title="Staff vs expenses split"
          description="Only the staff share is distributed. The remainder is held for other venue expenses."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Staff distributable %"
              hint="Default 50%. Remainder is expenses reserve."
            >
              <Input
                type="number"
                step="0.1"
                min={0}
                max={100}
                name="staff_distributable_percent"
                defaultValue={settings.staffDistributablePercent}
                className="h-8"
                required
              />
            </Field>
          </div>
        </Section>

        <Section title="Points system">
          <BenefitsPointTiersEditor
            tiers={tiers}
            onChange={setTiers}
            positions={positions}
          />
        </Section>

        <Section
          title="Worked days"
          description="Pool weight uses SHIFT + OFF only. Public holidays (PH / PH-REPL) and leave do not count."
        >
          <input type="hidden" name="include_regular_days_off" value="on" />
          <input type="hidden" name="exclude_leave" value="on" />
          <p className="text-sm text-black/60">
            This is a fixed rule, not a setting. Recalculate a run to refresh
            stored worked-day weights after roster changes.
          </p>
        </Section>

        <Section title="Disciplinary deductions">
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
          title="Special cases"
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
              label="Termination: entitled"
            />
          </div>
        </Section>

        <Section title="Notes">
          <textarea
            name="notes"
            defaultValue={settings.notes}
            rows={3}
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
          />
        </Section>

        <div className="flex justify-end border-t border-black/10 pt-4">
          <SaveButton />
        </div>
      </GuardedSettingsForm>
    </div>
  );
}
