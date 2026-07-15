"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveHrAttendanceImportRules } from "@/lib/actions/hr-attendance";
import type { HrAttendanceImportRules } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const LIGHT_INPUT =
  "border-black/15 bg-white text-black placeholder:text-black/40 focus-visible:ring-offset-white";

const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+4)" },
  { value: "Asia/Muscat", label: "Asia/Muscat (GST, UTC+4)" },
  { value: "Asia/Qatar", label: "Asia/Qatar (AST, UTC+3)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (AST, UTC+3)" },
  { value: "Asia/Kuwait", label: "Asia/Kuwait (AST, UTC+3)" },
  { value: "Asia/Bahrain", label: "Asia/Bahrain (AST, UTC+3)" },
  { value: "Asia/Karachi", label: "Asia/Karachi (PKT, UTC+5)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "Asia/Manila", label: "Asia/Manila (PHT, UTC+8)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "UTC", label: "UTC" },
];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save rules"}
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

export function AttendanceImportRulesPanel({
  settings,
}: {
  settings: HrAttendanceImportRules;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">Shift import rules</h2>
      <p className="mt-1 text-sm text-black/55">
        Controls how fingerprint punches map to a work day when shifts cross
        midnight, and how missing punches are treated.
      </p>

      <form action={saveHrAttendanceImportRules} className="mt-4 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Overnight cutoff (local time)"
            hint="Punches before this time on calendar day D belong to work day D−1. Example: punch at 01:00 on the 15th with cutoff 05:00 → clock-out for the 14th."
          >
            <Input
              name="overnight_cutoff_time"
              type="time"
              defaultValue={settings.overnightCutoffTime}
              className={cn(LIGHT_INPUT, "max-w-40")}
              required
            />
          </Field>
          <Field
            label="Max shift hours"
            hint="If clock-out − clock-in exceeds this, the day is flagged as incomplete for review."
          >
            <Input
              name="max_shift_hours"
              type="number"
              min={1}
              max={24}
              step={0.5}
              defaultValue={settings.maxShiftHours}
              className={cn(LIGHT_INPUT, "max-w-40")}
              required
            />
          </Field>
          <Field
            label="Timezone"
            hint="Venue local zone used when storing fingerprint punches. Orilla default Asia/Dubai."
          >
            <select
              name="timezone"
              defaultValue={settings.timezone}
              required
              className={cn(
                "flex h-10 w-full max-w-60 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40] focus-visible:ring-offset-2",
                LIGHT_INPUT,
              )}
            >
              {!TIMEZONE_OPTIONS.some((o) => o.value === settings.timezone) ? (
                <option value={settings.timezone}>{settings.timezone}</option>
              ) : null}
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 text-sm text-black/65">
          <p className="font-medium text-[#3D421F]">Pairing examples</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
            <li>
              16:00 on 14 May → clock <strong>in</strong> for 14 May
            </li>
            <li>
              01:00 on 15 May (before cutoff) → clock <strong>out</strong> for 14
              May
            </li>
            <li>
              12:00 on 15 May → clock <strong>in</strong> for 15 May
            </li>
            <li>
              Single punch for a work day → recorded as missing clock-in or
              missing clock-out (early-morning punches count as outs)
            </li>
          </ul>
        </div>

        <SaveButton />
      </form>
    </Card>
  );
}
