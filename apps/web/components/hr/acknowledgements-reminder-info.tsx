"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Info, Loader2, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAcknowledgementReminderSettings } from "@/lib/actions/hr-acknowledgements";
import {
  DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS,
  type HrAcknowledgementReminderSettings,
} from "@/lib/hr/acknowledgement";
import { cn } from "@/lib/utils";

export function AcknowledgementsReminderInfo({
  settings: initialSettings = DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS,
  canEdit = false,
}: {
  settings?: HrAcknowledgementReminderSettings;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  return (
    <div className="rounded-lg border border-black/10 bg-white/70">
      <div className="flex items-center gap-1 px-3 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Info className="size-4 shrink-0 text-[var(--venue-primary,#818a40)]" />
          <span className="text-sm font-medium text-[#3D421F]">
            How acknowledgement reminders work
          </span>
        </button>
        {canEdit ? (
          <button
            type="button"
            title="Change automatic reminder rule"
            aria-label="Change automatic reminder rule"
            onClick={() => setSettingsOpen(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10"
          >
            <Settings className="size-4" strokeWidth={2} />
          </button>
        ) : null}
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Hide reminder details" : "Show reminder details"}
          onClick={() => setOpen((value) => !value)}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-black/40 hover:bg-black/5"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-black/10 px-3 py-3 text-sm leading-relaxed text-black/65">
          <p>
            If an employee has not responded, use <strong>Remind</strong> to
            email them that acknowledgement is necessary and mandatory. The
            email reuses their original acknowledgement link. Subjects are
            numbered <strong>1st Reminder: please acknowledge</strong>,{" "}
            <strong>2nd Reminder: please acknowledge</strong>, and so on.
          </p>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-[#3D421F]">Automatic reminder rule</p>
              {canEdit ? (
                <button
                  type="button"
                  title="Change automatic reminder rule"
                  aria-label="Change automatic reminder rule"
                  onClick={() => setSettingsOpen(true)}
                  className="flex size-7 items-center justify-center rounded-md text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10"
                >
                  <Settings className="size-3.5" strokeWidth={2} />
                </button>
              ) : null}
            </div>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>
                <strong>Day {settings.firstReminderDay}</strong> after the
                original send: first automatic reminder.
              </li>
              <li>
                <strong>Day {settings.secondReminderDay}</strong> after the
                original send: second automatic reminder.
              </li>
              <li>
                {settings.dailyAfterSecond ? (
                  <>
                    <strong>After day {settings.secondReminderDay}</strong>: an
                    automatic reminder every day until they respond.
                  </>
                ) : (
                  <>
                    No further automatic reminders after the second send.
                  </>
                )}
              </li>
            </ol>
          </div>
          <p className="text-xs text-black/50">
            Automatic sending is not live yet. It can run on the same daily HR
            email job already used for boarding notices and expiry reminders —
            no Supabase plan upgrade is required. Manual Remind works now.
          </p>
        </div>
      ) : null}
      <AcknowledgementReminderSettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={setSettings}
      />
    </div>
  );
}

function AcknowledgementReminderSettingsDialog({
  open,
  settings,
  onClose,
  onSaved,
}: {
  open: boolean;
  settings: HrAcknowledgementReminderSettings;
  onClose: () => void;
  onSaved: (settings: HrAcknowledgementReminderSettings) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [firstReminderDay, setFirstReminderDay] = useState(
    String(settings.firstReminderDay),
  );
  const [secondReminderDay, setSecondReminderDay] = useState(
    String(settings.secondReminderDay),
  );
  const [dailyAfterSecond, setDailyAfterSecond] = useState(
    settings.dailyAfterSecond,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstReminderDay(String(settings.firstReminderDay));
    setSecondReminderDay(String(settings.secondReminderDay));
    setDailyAfterSecond(settings.dailyAfterSecond);
    setError(null);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  function handleSave() {
    const first = Math.floor(Number(firstReminderDay));
    const second = Math.floor(Number(secondReminderDay));
    if (!Number.isFinite(first) || first < 1 || first > 365) {
      setError("First reminder day must be between 1 and 365.");
      return;
    }
    if (!Number.isFinite(second) || second < 1 || second > 365) {
      setError("Second reminder day must be between 1 and 365.");
      return;
    }
    if (second <= first) {
      setError("The second reminder must be after the first reminder.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveAcknowledgementReminderSettings({
        firstReminderDay: first,
        secondReminderDay: second,
        dailyAfterSecond,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.settings);
      onClose();
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-reminder-settings-title"
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="ack-reminder-settings-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              Automatic reminder rule
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              Days are counted from the original acknowledgement email.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[#3D421F]">
              First automatic reminder
            </span>
            <span className="flex items-center gap-2 text-sm text-black/60">
              Day
              <Input
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                value={firstReminderDay}
                onChange={(event) => setFirstReminderDay(event.target.value)}
                className="h-10 w-20"
                disabled={pending}
              />
              after the original send
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[#3D421F]">
              Second automatic reminder
            </span>
            <span className="flex items-center gap-2 text-sm text-black/60">
              Day
              <Input
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                value={secondReminderDay}
                onChange={(event) => setSecondReminderDay(event.target.value)}
                className="h-10 w-20"
                disabled={pending}
              />
              after the original send
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-black/20"
              checked={dailyAfterSecond}
              onChange={(event) => setDailyAfterSecond(event.target.checked)}
              disabled={pending}
            />
            <span>
              <span className="block font-medium">
                Daily reminders after the second send
              </span>
              <span className="mt-0.5 block text-xs text-black/55">
                Keep sending one reminder every day until the employee responds.
              </span>
            </span>
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-9"
            onClick={handleSave}
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save rule
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
