"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { AnnualLeaveCalculationDetails } from "@/components/hr/annual-leave-calculation-card";
import { LeaveBalanceRing } from "@/components/hr/leave-balance-ring";
import { formatLeaveDays } from "@/lib/hr/leave";
import type {
  MobileLeaveBalanceCard,
  MobileLeaveBalances,
} from "@/lib/mobile/employee-leave-balances";
import { cn } from "@/lib/utils";

type MobileLeaveBalancesPanelProps = {
  balances: MobileLeaveBalances;
};

export function MobileLeaveBalancesPanel({
  balances,
}: MobileLeaveBalancesPanelProps) {
  const [showOther, setShowOther] = useState(false);
  const [openStagesCode, setOpenStagesCode] = useState<string | null>(null);
  const otherCount = balances.other.length;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-[#3D421F] dark:text-[CanvasText]">
          Your balances
        </h2>
        <p className="text-xs text-black/40 dark:text-white/40">{balances.year}</p>
      </div>
      <p className="mt-1 text-xs text-black/45 dark:text-white/45">
        Days left this year. Use the arrow on annual leave for the calculation,
        and on sick leave for full, half, and unpaid balances.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3">
        {balances.primary.map((card) => (
          <PrimaryBalanceCard
            key={card.code}
            card={card}
            open={openStagesCode === card.code}
            onToggle={() =>
              setOpenStagesCode((current) =>
                current === card.code ? null : card.code,
              )
            }
            onClose={() => setOpenStagesCode(null)}
          />
        ))}
      </div>

      {otherCount > 0 ? (
        <div className="mt-4 space-y-3">
          <button
            type="button"
            aria-expanded={showOther}
            onClick={() => setShowOther((value) => !value)}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] shadow-sm dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText]",
              showOther &&
                "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-secondary,#F0F3DD)]/50",
            )}
          >
            {showOther
              ? "Hide other kinds"
              : `Show other kinds (${otherCount})`}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-black/45 transition-transform dark:text-white/45",
                showOther && "rotate-180",
              )}
            />
          </button>

          {showOther ? (
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/12 dark:bg-white/[0.06]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 bg-black/[0.02] text-[10px] uppercase tracking-wide text-black/50 dark:border-white/12 dark:bg-white/[0.04] dark:text-white/45">
                  <tr>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 text-right font-medium">Entitled</th>
                    <th className="px-2 py-2 text-right font-medium">Used</th>
                    <th className="px-3 py-2 text-right font-medium">Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/10">
                  {balances.other.map((row) => {
                    const extras = [
                      row.scheduled ? `${formatLeaveDays(row.scheduled)} scheduled` : null,
                      row.pending ? `${formatLeaveDays(row.pending)} pending` : null,
                    ].filter(Boolean);
                    return (
                      <tr key={row.code}>
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="shrink-0 font-mono text-[11px] text-black/45 dark:text-white/45">
                              {row.code}
                            </span>
                            <span className="truncate text-[#3D421F] dark:text-[CanvasText]">
                              {row.label}
                            </span>
                          </div>
                          {extras.length ? (
                            <p className="mt-0.5 text-[11px] text-black/40 dark:text-white/40">
                              {extras.join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-black/60 dark:text-white/60">
                          {formatLeaveDays(row.entitled)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-black/60 dark:text-white/60">
                          {formatLeaveDays(row.used)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums font-semibold",
                            row.available < 0
                              ? "text-red-700"
                              : "text-[var(--venue-primary,#818a40)]",
                          )}
                        >
                          {formatLeaveDays(row.available)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PrimaryBalanceCard({
  card,
  open,
  onToggle,
  onClose,
}: {
  card: MobileLeaveBalanceCard;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const stages = card.stages;
  const calculation = card.annualLeaveCalculation;
  const expandable = Boolean(stages?.length) || Boolean(calculation);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, onClose]);

  if (!expandable) {
    return (
      <LeaveBalanceRing
        code={card.code}
        label={card.label}
        available={card.available}
        used={card.used}
        total={card.total}
      />
    );
  }

  const hint = calculation
    ? "View annual leave calculation"
    : `View ${card.label.toLowerCase()} stages`;

  return (
    <div ref={popupRef}>
      <LeaveBalanceRing
        code={card.code}
        label={card.label}
        available={card.available}
        used={card.used}
        total={card.total}
        expanded={open}
        hint={hint}
        onClick={onToggle}
      />
      {open && calculation ? (
        <div
          role="dialog"
          aria-label="Annual leave calculation"
          className="mt-2 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/12 dark:bg-[#2a2c1f]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              Annual leave calculation
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-black/45 transition hover:bg-black/[0.04] hover:text-[#3D421F] dark:text-white/50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-3 py-3">
            <AnnualLeaveCalculationDetails
              calculation={calculation}
              compact
            />
          </div>
        </div>
      ) : null}
      {open && stages?.length ? (
        <div
          role="dialog"
          aria-label={`${card.label} stages`}
          className="mt-2 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/12 dark:bg-[#2a2c1f]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/45 dark:text-white/45">
              {card.label} stages
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-black/45 transition hover:bg-black/[0.04] hover:text-[#3D421F] dark:text-white/50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {stages.map((stage) => (
              <li
                key={stage.code}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-black/45 dark:text-white/45">
                    {stage.code}
                  </p>
                  <p className="truncate text-sm font-semibold text-[#3D421F] dark:text-[CanvasText]">
                    {stage.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-black/40 dark:text-white/40">
                    {formatLeaveDays(stage.used)} taken ·{" "}
                    {formatLeaveDays(stage.total)} eligible
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "text-lg font-semibold tabular-nums leading-none",
                      stage.available < 0
                        ? "text-red-700"
                        : "text-[var(--venue-primary,#818a40)]",
                    )}
                  >
                    {formatLeaveDays(stage.available)}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
                    days left
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
