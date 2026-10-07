"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  saveCosMonthlyTargetsAction,
  saveCosSettingsAction,
} from "@/lib/actions/cos";
import { MONTH_LABELS, weeksInMonth } from "@/lib/sales/cos-calculations";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  type CostCentre,
  type VenueCosMonthlyTarget,
} from "@/lib/sales/cos-types";
import { cn } from "@/lib/utils";

type DefaultsRow = {
  cost_centre: CostCentre;
  target_cost_pct: number;
  purchase_target_gs: number;
  closing_stock_target_gs: number;
  auto_adjustment_pct: number;
  ledger_account_ids: string[];
};

type Field =
  "target_cost_pct" | "purchase_target_gs" | "closing_stock_target_gs";

const FIELDS: { key: Field; label: string; suffix?: string }[] = [
  { key: "target_cost_pct", label: "Target cost %", suffix: "%" },
  { key: "purchase_target_gs", label: "Purchase target" },
  { key: "closing_stock_target_gs", label: "Closing stock target" },
];

/** Month cell drafts: "" means "use the default". */
type MonthDraft = Record<Field, string>;

const key = (centre: CostCentre, year: number, month: number) =>
  `${centre}:${year}:${month}`;

function toDraft(t: VenueCosMonthlyTarget | undefined): MonthDraft {
  const s = (v: number | null | undefined) => (v == null ? "" : String(v));
  return {
    target_cost_pct: s(t?.target_cost_pct),
    purchase_target_gs: s(t?.purchase_target_gs),
    closing_stock_target_gs: s(t?.closing_stock_target_gs),
  };
}

function parse(v: string): number | null {
  const t = v.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const cellInput =
  "h-9 w-full rounded-md border border-black/10 bg-white px-2.5 text-right text-sm tabular-nums text-[#3D421F] outline-none placeholder:text-black/30 focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:opacity-60";

/**
 * `defaults` / `onDefaultsChange` are owned by the settings panel so every
 * tab saves the same, current settings row.
 */
export function CosTargetsEditor({
  defaults,
  onDefaultsChange,
  monthly,
  currentYear,
  canEdit,
}: {
  defaults: DefaultsRow[];
  onDefaultsChange: (centre: CostCentre, patch: Partial<DefaultsRow>) => void;
  monthly: VenueCosMonthlyTarget[];
  currentYear: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [centre, setCentre] = useState<CostCentre>("food");
  const [year, setYear] = useState(currentYear);
  const [drafts, setDrafts] = useState<Record<string, MonthDraft>>(() => {
    const out: Record<string, MonthDraft> = {};
    for (const t of monthly) {
      out[key(t.cost_centre, t.fiscal_year, t.month_index)] = toDraft(t);
    }
    return out;
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const defaultsRow = defaults.find((d) => d.cost_centre === centre)!;
  const draftFor = (m: number) =>
    drafts[key(centre, year, m)] ?? toDraft(undefined);

  function setMonth(m: number, field: Field, value: string) {
    setSaved(false);
    setDrafts((d) => ({
      ...d,
      [key(centre, year, m)]: { ...draftFor(m), [field]: value },
    }));
  }

  function setDefault(field: Field, value: string) {
    setSaved(false);
    onDefaultsChange(centre, { [field]: parse(value) ?? 0 });
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveCosSettingsAction(defaultsRow);
      await saveCosMonthlyTargetsAction({
        cost_centre: centre,
        fiscal_year: year,
        months: MONTH_LABELS.map((_, m) => {
          const d = draftFor(m);
          return {
            month_index: m,
            target_cost_pct: parse(d.target_cost_pct),
            purchase_target_gs: parse(d.purchase_target_gs),
            closing_stock_target_gs: parse(d.closing_stock_target_gs),
          };
        }),
      });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-black/[0.04] p-1">
          {COST_CENTRES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCentre(c);
                setSaved(false);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                centre === c
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-black/60 hover:text-black",
              )}
            >
              {COST_CENTRE_LABELS[c]}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setSaved(false);
          }}
          aria-label="Year"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F]"
        >
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="text-xs text-black/45">
          Leave a month blank to use the default.
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/60 text-xs font-bold uppercase tracking-wide text-black/70">
              <th className="px-4 py-2.5 text-left">Month</th>
              <th className="px-3 py-2.5 text-left">Weeks</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="w-44 px-3 py-2.5 text-right">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25">
              <td
                className="px-4 py-2 font-semibold text-[#3D421F]"
                colSpan={2}
              >
                Default
                <span className="ml-2 text-xs font-normal text-black/45">
                  used by months left blank
                </span>
              </td>
              {FIELDS.map((f) => (
                <td key={f.key} className="px-3 py-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    disabled={!canEdit}
                    value={defaultsRow[f.key]}
                    onChange={(e) => setDefault(f.key, e.target.value)}
                    aria-label={`Default ${f.label}`}
                    className={cn(cellInput, "font-semibold")}
                  />
                </td>
              ))}
            </tr>
            {MONTH_LABELS.map((label, m) => {
              const weeks = weeksInMonth(m);
              const d = draftFor(m);
              return (
                <tr
                  key={label}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="px-4 py-1.5 font-medium text-[#3D421F]">
                    {label}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-black/45">
                    W{weeks[0]}–W{weeks[weeks.length - 1]}
                  </td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="px-3 py-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={d[f.key]}
                        placeholder={String(defaultsRow[f.key])}
                        onChange={(e) => setMonth(m, f.key, e.target.value)}
                        aria-label={`${label} ${f.label}`}
                        className={cellInput}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {canEdit ? (
          <div className="flex items-center justify-end gap-3 border-t border-black/5 px-4 py-3">
            {saved ? (
              <span className="text-xs font-semibold text-emerald-600">
                Saved
              </span>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending
                ? "Saving…"
                : `Save ${COST_CENTRE_LABELS[centre]} targets ${year}`}
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
