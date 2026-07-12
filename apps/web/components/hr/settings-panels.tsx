"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveHrExpirySettings,
  saveHrNotificationSettings,
  saveHrSalaryDefaults,
} from "@/lib/actions/hr";
import type {
  HrExpirySettings,
  HrNotificationSettings,
  HrSalaryDefaults,
} from "@/lib/hr/types";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
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
      <Label className="text-sm text-[#3D421F]">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-black/45">{hint}</p> : null}
    </div>
  );
}

export function ExpirySettingsPanel({ settings }: { settings: HrExpirySettings }) {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">Expiry & reminders</h2>
      <p className="mt-1 text-sm text-black/55">
        Controls how far ahead expiries appear on the HR dashboard and when
        reminder notifications fire.
      </p>
      <form action={saveHrExpirySettings} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Display window (days)"
            hint="Expiries within this many days are shown on the HR overview."
          >
            <Input
              name="display_window_days"
              type="number"
              min={1}
              defaultValue={settings.displayWindowDays}
              className="max-w-40"
            />
          </Field>
          <Field
            label="Reminder lead days"
            hint="Comma-separated, e.g. 30, 14, 7. Notifications fire at each lead."
          >
            <Input
              name="reminder_lead_days"
              defaultValue={settings.reminderLeadDays.join(", ")}
              className="max-w-60"
            />
          </Field>
        </div>
        <SaveButton />
      </form>
    </Card>
  );
}

export function SalaryDefaultsPanel({
  settings,
}: {
  settings: HrSalaryDefaults;
}) {
  const total = settings.basicPct + settings.accomPct + settings.transpPct;

  return (
    <Card className="p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">Salary & package defaults</h2>
      <p className="mt-1 text-sm text-black/55">
        Defaults applied when creating new staff. The three package percentages
        should total 100%.
      </p>
      <form action={saveHrSalaryDefaults} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Basic salary (%)">
            <Input
              name="basic_pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={settings.basicPct}
            />
          </Field>
          <Field label="Accommodation (%)">
            <Input
              name="accom_pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={settings.accomPct}
            />
          </Field>
          <Field label="Transport (%)">
            <Input
              name="transp_pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={settings.transpPct}
            />
          </Field>
        </div>
        <p
          className={
            total === 100
              ? "text-xs text-emerald-600"
              : "text-xs text-amber-600"
          }
        >
          Current split totals {total}%.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Annual leave (days/year)">
            <Input
              name="annual_leave_days"
              type="number"
              min={0}
              defaultValue={settings.annualLeaveDays}
              className="max-w-40"
            />
          </Field>
          <Field
            label="EOSB accrual (days/year)"
            hint="End-of-service benefit days of basic pay accrued per year."
          >
            <Input
              name="eosb_days_per_year"
              type="number"
              min={0}
              defaultValue={settings.eosbDaysPerYear}
              className="max-w-40"
            />
          </Field>
        </div>
        <SaveButton />
      </form>
    </Card>
  );
}

export function NotificationSettingsPanel({
  settings,
}: {
  settings: HrNotificationSettings;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">Notifications</h2>
      <p className="mt-1 text-sm text-black/55">
        Choose which HR events send emails and which roles receive them.
      </p>
      <form action={saveHrNotificationSettings} className="mt-4 space-y-4">
        <div className="space-y-2.5">
          <Toggle
            name="expiry_emails_enabled"
            label="Document & certification expiry reminders"
            defaultChecked={settings.expiryEmailsEnabled}
          />
          <Toggle
            name="new_staff_enabled"
            label="New staff added"
            defaultChecked={settings.newStaffEnabled}
          />
          <Toggle
            name="termination_enabled"
            label="Staff termination"
            defaultChecked={settings.terminationEnabled}
          />
        </div>
        <Field
          label="Recipient roles"
          hint="Comma-separated role keys, e.g. hr_manager, general_manager."
        >
          <Input
            name="recipient_roles"
            defaultValue={settings.recipientRoles.join(", ")}
            className="max-w-md"
          />
        </Field>
        <SaveButton />
      </form>
    </Card>
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
    <label className="flex items-center gap-3 text-sm text-[#3D421F]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
      />
      {label}
    </label>
  );
}
