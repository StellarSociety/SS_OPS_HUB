"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { CosTargetsEditor } from "@/components/sales/cos/cos-targets-editor";
import type { LedgerAccountOption } from "@/lib/sales/cos-purchases-data";
import type { VenueCosMonthlyTarget } from "@/lib/sales/cos-types";
import { saveCosSettingsAction } from "@/lib/actions/cos";
import { pillSubNavLinkClass, pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { COST_CENTRE_LABELS, type CostCentre } from "@/lib/sales/cos-types";

type Row = {
  cost_centre: CostCentre;
  target_cost_pct: number;
  purchase_target_gs: number;
  closing_stock_target_gs: number;
  auto_adjustment_pct: number;
  ledger_account_ids: string[];
};

type SettingsTab = "targets" | "adjustments" | "ledger";

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "targets", label: "Targets" },
  { value: "adjustments", label: "Adjustments" },
  { value: "ledger", label: "Ledger accounts" },
];

export function CosSettingsPanel({
  rows: initial,
  canEdit,
  ledgerAccounts,
  monthly,
  currentYear,
}: {
  rows: Row[];
  canEdit: boolean;
  ledgerAccounts: LedgerAccountOption[];
  monthly: VenueCosMonthlyTarget[];
  currentYear: number;
}) {
  // Cost-of-sales ledgers first, then the rest, each by code.
  const ledgerOptions = [...ledgerAccounts]
    .sort(
      (a, b) =>
        Number(b.accountType === "cost_of_sales") -
          Number(a.accountType === "cost_of_sales") ||
        a.code.localeCompare(b.code),
    )
    .map((a) => ({
      value: a.id,
      label: `${a.code} · ${a.name}`,
      searchText: `${a.code} ${a.name} ${a.accountType}`,
    }));
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<SettingsTab>("targets");

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function saveAll() {
    setSaved(null);
    startTransition(async () => {
      for (const row of rows) await saveCosSettingsAction(row);
      setSaved("all");
      router.refresh();
    });
  }


  return (
    <div className="space-y-4">
      <nav aria-label="Settings sections" className={pillSubNavShellClass}>
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-current={tab === t.value ? "page" : undefined}
            onClick={() => setTab(t.value)}
            className={pillSubNavLinkClass(tab === t.value)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "adjustments" ? (
        <p className="text-sm text-black/55">
          When a cost run has discounts, an automatic adjustment of this
          percentage of the cost centre&apos;s NET discounts is added to the
          run&apos;s adjustments.
        </p>
      ) : null}

      {tab === "ledger" ? (
        <>
          <p className="text-sm text-black/55">
            Link the Accounts ledger accounts that hold each cost centre&apos;s
            purchases. Approved and posted supplier invoices on these ledgers
            show on the cost centre&apos;s Purchases page and in each cost run
            (by invoice date), next to the STO figure.
          </p>
          <Card className="overflow-visible p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/60 text-xs font-bold uppercase tracking-wide text-black/70">
                  <th className="w-40 px-4 py-2.5 text-left">Cost centre</th>
                  <th className="px-4 py-2.5 text-left">Ledger accounts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.cost_centre}
                    className="border-b border-black/5 align-top last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-[#3D421F]">
                      {COST_CENTRE_LABELS[row.cost_centre]}
                    </td>
                    <td className="px-4 py-2">
                      <SearchableMultiSelect
                        values={row.ledger_account_ids}
                        onChange={(next) =>
                          update(i, { ledger_account_ids: next })
                        }
                        options={ledgerOptions}
                        placeholder="Select ledger accounts…"
                        searchPlaceholder="Search code or name…"
                        disabled={!canEdit}
                        aria-label={`${COST_CENTRE_LABELS[row.cost_centre]} ledger accounts`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit ? (
              <div className="flex items-center justify-end gap-3 border-t border-black/5 px-4 py-3">
                {saved === "all" ? (
                  <span className="text-xs font-semibold text-emerald-600">
                    Saved
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={saveAll}
                  className="rounded-lg bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save ledger links"}
                </button>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      {tab === "adjustments" ? (
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/60 text-xs font-bold uppercase tracking-wide text-black/70">
                <th className="px-4 py-2.5 text-left">Cost centre</th>
                <th className="w-48 px-4 py-2.5 text-right">
                  Auto adjustment %
                </th>
                <th className="px-4 py-2.5 text-left">Applies to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.cost_centre}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="px-4 py-2 font-medium text-[#3D421F]">
                    {COST_CENTRE_LABELS[row.cost_centre]}
                  </td>
                  <td className="px-4 py-2">
                    <div className="ml-auto flex w-32 items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        disabled={!canEdit}
                        value={row.auto_adjustment_pct}
                        onChange={(e) =>
                          update(i, {
                            auto_adjustment_pct:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                        aria-label={`${COST_CENTRE_LABELS[row.cost_centre]} auto adjustment %`}
                        className="h-9 text-right"
                      />
                      <span className="text-sm text-black/50">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-black/55">
                    {row.auto_adjustment_pct
                      ? `(-) Deduction of ${row.auto_adjustment_pct}% of ${COST_CENTRE_LABELS[row.cost_centre].toLowerCase()} net discounts`
                      : "Off"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit ? (
            <div className="flex items-center justify-end gap-3 border-t border-black/5 px-4 py-3">
              {saved === "all" ? (
                <span className="text-xs font-semibold text-emerald-600">
                  Saved
                </span>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={saveAll}
                className="rounded-lg bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save adjustments"}
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === "targets" ? (
        <CosTargetsEditor
          defaults={rows}
          onDefaultsChange={(centre, patch) =>
            update(
              rows.findIndex((r) => r.cost_centre === centre),
              patch,
            )
          }
          monthly={monthly}
          currentYear={currentYear}
          canEdit={canEdit}
        />
      ) : null}
    </div>
  );
}
