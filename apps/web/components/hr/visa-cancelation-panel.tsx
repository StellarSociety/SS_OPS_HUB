"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { VisaCancelationFileField } from "@/components/hr/visa-cancelation-file-field";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/components/ui/toast";
import {
  listStaffVisaRecords,
  updateStaffVisaCancelDate,
} from "@/lib/actions/hr-visa";
import { cn } from "@/lib/utils";

const dateFieldClass =
  "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function useStaffVisaCancelation(staffId: string | null) {
  const [cancelDate, setCancelDate] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!staffId) {
      setCancelDate("");
      setRecordId(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    void listStaffVisaRecords({ staffId }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCancelDate("");
        setRecordId(null);
        setLoadError(result.error);
        return;
      }
      const latest =
        result.records.find((row) => row.id === result.latestId) ??
        result.records[0] ??
        null;
      setRecordId(latest?.id ?? result.latestId);
      setCancelDate(latest?.cancelDate ?? "");
      setLoadError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  async function persistCancelDate(iso: string) {
    setCancelDate(iso);
    if (!staffId) return;
    setSavingDate(true);
    const result = await updateStaffVisaCancelDate({
      staffId,
      cancelDate: iso.trim() ? iso : null,
      recordId: recordId ?? undefined,
    });
    setSavingDate(false);
    if (!result.ok) {
      toast.error(result.error);
      setLoadError(result.error);
      return;
    }
    setRecordId(result.recordId);
    setLoadError(null);
  }

  return {
    cancelDate,
    recordId,
    savingDate,
    loadError,
    persistCancelDate,
  };
}

export function VisaCancelationPanel({
  staffId,
  empNo,
  fullName,
  readOnly = false,
  dateInputId,
  done = false,
  doneLabel,
  onDoneChange,
  children,
  className,
}: {
  staffId: string;
  empNo: string;
  fullName: string;
  readOnly?: boolean;
  dateInputId: string;
  done?: boolean;
  doneLabel?: string | null;
  onDoneChange?: (next: boolean) => void;
  children?: ReactNode;
  className?: string;
}) {
  const { cancelDate, recordId, savingDate, loadError, persistCancelDate } =
    useStaffVisaCancelation(staffId);
  const [open, setOpen] = useState(!done);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white",
        done
          ? "border-[var(--venue-primary,#818a40)]/25"
          : "border-[var(--venue-primary,#818a40)]/35",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start gap-3 px-3 py-2.5",
          done
            ? "bg-[var(--venue-secondary,#F0F3DD)]/70"
            : "bg-[var(--venue-primary,#818a40)]/15",
        )}
      >
        {onDoneChange ? (
          <input
            type="checkbox"
            className="mt-0.5"
            checked={done}
            disabled={readOnly}
            aria-label="Mark visa cancelation done"
            onChange={(event) => {
              event.stopPropagation();
              if (readOnly) return;
              onDoneChange(event.target.checked);
            }}
          />
        ) : (
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
              done
                ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)] text-white"
                : "border-black/20 bg-white",
            )}
            aria-hidden
          >
            {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </span>
        )}
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span
            className={cn(
              "block text-sm font-semibold text-[#3D421F]",
              done && "text-black/45 line-through",
            )}
          >
            Visa cancelation
          </span>
          {done && doneLabel ? (
            <span className="mt-0.5 block text-xs text-black/40">
              {doneLabel}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-black/45">
              Date and letter sync with Staff → Employment documents and Assets
              → Visa.
            </span>
          )}
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-black/40 transition hover:bg-black/5 hover:text-[#3D421F]"
          aria-label={open ? "Hide visa cancelation details" : "Show visa cancelation details"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open ? (
        <div className="space-y-4 border-t border-black/5 px-3 py-3">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <VisaCancelationFileField
              staffId={staffId}
              empNo={empNo}
              fullName={fullName}
              fileSlotId={recordId}
              docExpiry={cancelDate || null}
              readOnly={readOnly}
            />
            <div className="space-y-2">
              <label
                htmlFor={dateInputId}
                className="block text-sm font-medium text-[#3D421F]"
              >
                Cancelation date
              </label>
              <p className="min-h-[2.5rem] text-[11px] leading-snug text-black/40">
                Synced with Staff → Employment documents and Assets → Visa.
              </p>
              <DateInput
                id={dateInputId}
                value={cancelDate}
                onChange={(iso) => {
                  void persistCancelDate(iso);
                }}
                disabled={readOnly || savingDate}
                className="w-full"
                inputClassName={dateFieldClass}
              />
              {loadError ? (
                <p className="text-xs text-red-700">{loadError}</p>
              ) : null}
            </div>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
