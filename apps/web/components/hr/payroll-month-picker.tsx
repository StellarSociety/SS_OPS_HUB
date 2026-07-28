"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatMonthKeyLabel,
  monthKeyFromDate,
} from "@/components/hr/attendance-date-filters";
import {
  formatPayrollMonthLabel,
  mergePayrollSettings,
  resolvePayrollPeriod,
} from "@/lib/hr/payroll";
import { formatIsoDateShort } from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

type PayrollMonthPickerProps = {
  value: string;
  onChange: (monthKey: string) => void;
  id?: string;
  label?: string;
  /** Venue payroll period start day (1–28). Enables period range labels. */
  periodStartDay?: number;
  /** Venue payroll period end day (1–28). */
  periodEndDay?: number;
  disabled?: boolean;
  className?: string;
};

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const date = new Date(y, m - 1 + delta, 1);
  return monthKeyFromDate(date);
}

function usePopoverPosition(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  const update = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 304;
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8,
    );
    setPosition({ top: rect.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    update();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = () => update();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [open]);

  return { position, update };
}

/**
 * Styled single-month selector (year grid + prev/next), replacing native
 * `<input type="month">` for payroll run creation.
 */
export function PayrollMonthPicker({
  value,
  onChange,
  id,
  label = "Payroll month",
  periodStartDay,
  periodEndDay,
  disabled = false,
  className,
}: PayrollMonthPickerProps) {
  const calendarId = useId();
  const inputId = id ?? calendarId;
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { position, update } = usePopoverPosition(open, containerRef);

  const settings = useMemo(() => {
    if (periodStartDay == null || periodEndDay == null) return null;
    return mergePayrollSettings({ periodStartDay, periodEndDay });
  }, [periodStartDay, periodEndDay]);

  const [viewYear, setViewYear] = useState(() => {
    const [y] = value.split("-").map(Number);
    return y || new Date().getFullYear();
  });

  const triggerLabel = useMemo(() => {
    if (!value) return "Select month";
    try {
      return formatPayrollMonthLabel(`${value}-01`);
    } catch {
      return formatMonthKeyLabel(value);
    }
  }, [value]);

  const periodLabel = useMemo(() => {
    if (!settings || !value) return null;
    try {
      const period = resolvePayrollPeriod(value, settings);
      return `${formatIsoDateShort(period.periodStart)} → ${formatIsoDateShort(period.periodEnd)}`;
    } catch {
      return null;
    }
  }, [settings, value]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(viewYear, i, 1);
      const key = monthKeyFromDate(date);
      let range = "";
      if (settings) {
        try {
          const period = resolvePayrollPeriod(key, settings);
          range = `${formatIsoDateShort(period.periodStart)} → ${formatIsoDateShort(period.periodEnd)}`;
        } catch {
          range = "";
        }
      }
      return {
        key,
        label: date.toLocaleString(undefined, { month: "short" }),
        range,
      };
    });
  }, [viewYear, settings]);

  const todayKey = monthKeyFromDate(new Date());

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function openPicker() {
    if (disabled) return;
    const [y] = value.split("-").map(Number);
    setViewYear(y || new Date().getFullYear());
    update();
    setOpen(true);
  }

  return (
    <>
      <div ref={containerRef} className={cn("flex flex-col gap-1", className)}>
        <label
          htmlFor={inputId}
          className="text-[11px] font-medium uppercase tracking-wide text-black/45"
        >
          {label}
        </label>
        <div
          className={cn(
            "inline-flex h-10 items-stretch overflow-hidden rounded-lg border bg-white transition-colors",
            open
              ? "border-[var(--venue-primary)]/45 shadow-sm"
              : "border-black/10 hover:border-black/20",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <button
            type="button"
            disabled={disabled}
            aria-label="Previous month"
            onClick={() => onChange(shiftMonthKey(value, -1))}
            className="inline-flex w-9 shrink-0 items-center justify-center border-r border-black/8 text-[#3D421F]/70 transition-colors hover:bg-[var(--venue-secondary)]/40 hover:text-[#3D421F]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>

          <button
            type="button"
            id={inputId}
            disabled={disabled}
            aria-controls={calendarId}
            aria-expanded={open}
            aria-haspopup="dialog"
            title={periodLabel ?? triggerLabel}
            onClick={() => {
              if (open) setOpen(false);
              else openPicker();
            }}
            className="flex min-w-[11.5rem] flex-1 items-center gap-2 px-2.5 text-left transition-colors hover:bg-black/[0.02]"
          >
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary)] opacity-80"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold tabular-nums text-[#3D421F]">
                {triggerLabel}
              </span>
              {periodLabel ? (
                <span className="block truncate text-[10px] tabular-nums text-black/45">
                  {periodLabel}
                </span>
              ) : null}
            </span>
          </button>

          <button
            type="button"
            disabled={disabled}
            aria-label="Next month"
            onClick={() => onChange(shiftMonthKey(value, 1))}
            className="inline-flex w-9 shrink-0 items-center justify-center border-l border-black/8 text-[#3D421F]/70 transition-colors hover:bg-[var(--venue-secondary)]/40 hover:text-[#3D421F]"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              id={calendarId}
              role="dialog"
              aria-label="Select payroll month"
              className="fixed z-[250]"
              style={{ top: position.top, left: position.left }}
            >
              <div className="w-[19rem] rounded-xl border border-black/10 bg-white p-3 shadow-lg">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y - 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Previous year"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <p className="text-sm font-semibold text-[#3D421F]">
                    {viewYear}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y + 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Next year"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {months.map((month) => {
                    const isActive = value === month.key;
                    const isCurrent = todayKey === month.key;
                    return (
                      <button
                        key={month.key}
                        type="button"
                        title={month.range || formatMonthKeyLabel(month.key)}
                        onClick={() => {
                          onChange(month.key);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex flex-col items-center rounded-md px-2 py-2 text-center transition-colors",
                          isActive
                            ? "bg-[var(--venue-primary)] text-white"
                            : isCurrent
                              ? "bg-[var(--venue-secondary)]/50 text-[#3D421F] hover:bg-[var(--venue-secondary)]/80"
                              : "text-[#3D421F] hover:bg-black/[0.04]",
                        )}
                      >
                        <span className="text-sm font-semibold">
                          {month.label}
                        </span>
                        {month.range ? (
                          <span
                            className={cn(
                              "mt-0.5 text-[9px] leading-tight tabular-nums",
                              isActive ? "text-white/80" : "text-black/45",
                            )}
                          >
                            {month.range}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {settings ? (
                  <p className="mt-3 text-[11px] leading-snug text-black/45">
                    Period {settings.periodStartDay}→{settings.periodEndDay}{" "}
                    for the selected payroll month.
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
