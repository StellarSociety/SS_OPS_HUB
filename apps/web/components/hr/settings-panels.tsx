"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const lightInputClass =
  "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] placeholder:text-black/40 outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

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
      <Label className="text-sm font-medium text-[#3D421F]">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-black/45">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <h3 className="font-serif text-lg text-[#3D421F]">{title}</h3>
      <p className="mt-1 text-sm text-black/55">{description}</p>
      {children}
    </div>
  );
}

export function ExpirySettingsPanel({ settings }: { settings: HrExpirySettings }) {
  return (
    <Panel
      title="Expiry & reminders"
      description="Controls how far ahead expiries appear on the HR dashboard and when reminder notifications fire."
    >
      <form action={saveHrExpirySettings} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Display window (days)"
            hint="Expiries within this many days are shown on the HR overview."
          >
            <input
              name="display_window_days"
              type="number"
              min={1}
              defaultValue={settings.displayWindowDays}
              className={cn(lightInputClass, "max-w-40")}
            />
          </Field>
          <Field
            label="Reminder lead days"
            hint="Comma-separated, e.g. 30, 14, 7. Notifications fire at each lead."
          >
            <input
              name="reminder_lead_days"
              defaultValue={settings.reminderLeadDays.join(", ")}
              className={cn(lightInputClass, "max-w-60")}
            />
          </Field>
        </div>
        <SaveButton />
      </form>
    </Panel>
  );
}

export function SalaryDefaultsPanel({
  settings,
}: {
  settings: HrSalaryDefaults;
}) {
  const total = settings.basicPct + settings.accomPct + settings.transpPct;

  return (
    <Panel
      title="Salary & package defaults"
      description="Defaults applied when creating new staff. The three package percentages should total 100%."
    >
      <form action={saveHrSalaryDefaults} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Basic salary (%)">
            <input
              name="basic_pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={settings.basicPct}
              className={lightInputClass}
            />
          </Field>
          <Field label="Accommodation (%)">
            <input
              name="accom_pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={settings.accomPct}
              className={lightInputClass}
            />
          </Field>
          <Field label="Transport (%)">
            <input
              name="transp_pct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={settings.transpPct}
              className={lightInputClass}
            />
          </Field>
        </div>
        <p
          className={
            total === 100
              ? "text-xs text-emerald-700"
              : "text-xs text-amber-800"
          }
        >
          Current split totals {total}%.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Annual leave (days/year)">
            <input
              name="annual_leave_days"
              type="number"
              min={0}
              defaultValue={settings.annualLeaveDays}
              className={cn(lightInputClass, "max-w-40")}
            />
          </Field>
          <Field
            label="EOSB accrual (days/year)"
            hint="End-of-service benefit days of basic pay accrued per year."
          >
            <input
              name="eosb_days_per_year"
              type="number"
              min={0}
              defaultValue={settings.eosbDaysPerYear}
              className={cn(lightInputClass, "max-w-40")}
            />
          </Field>
        </div>
        <SaveButton />
      </form>
    </Panel>
  );
}

export function NotificationSettingsPanel({
  settings,
}: {
  settings: HrNotificationSettings;
}) {
  return (
    <Panel
      title="Channels & roles"
      description="Choose which HR events send emails and which roles receive them."
    >
      <form action={saveHrNotificationSettings} className="mt-5 space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Events
          </p>
          <div className="divide-y divide-black/5 overflow-hidden rounded-lg border border-black/10">
            <Toggle
              name="expiry_emails_enabled"
              label="Document & certification expiry reminders"
              hint="Uses the lead days under Expiry & Reminders."
              defaultChecked={settings.expiryEmailsEnabled}
            />
            <Toggle
              name="new_staff_enabled"
              label="New staff added"
              hint="Notify when a staff profile is created."
              defaultChecked={settings.newStaffEnabled}
            />
            <Toggle
              name="termination_enabled"
              label="Staff termination"
              hint="Notify when a termination date is set."
              defaultChecked={settings.terminationEnabled}
            />
          </div>
        </div>
        <Field
          label="Recipient roles"
          hint="Comma-separated role keys, e.g. hr_manager, general_manager."
        >
          <input
            name="recipient_roles"
            defaultValue={settings.recipientRoles.join(", ")}
            className={cn(lightInputClass, "max-w-md")}
          />
        </Field>
        <SaveButton />
      </form>
    </Panel>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 bg-white px-3 py-3 transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/35">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#3D421F]">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-black/45">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
