"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { MONTH_LABELS, weeksInMonth } from "@/lib/sales/cos-calculations";
import type { CosLedgerPurchaseRow } from "@/lib/sales/cos-purchases-data";
import { COST_CENTRE_LABELS, type CostCentre } from "@/lib/sales/cos-types";
import { cn } from "@/lib/utils";

export type CosPurchasesScope = "week" | "month";

const MONEY = (n: number) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

const selectClass =
  "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F]";

export function CosPurchasesTable({
  centre,
  scope,
  fiscalYear,
  weekNo,
  monthIndex,
  from,
  to,
  weeks,
  rows,
  ledgerCount,
}: {
  centre: CostCentre;
  scope: CosPurchasesScope;
  fiscalYear: number;
  weekNo: number;
  monthIndex: number;
  from: string;
  to: string;
  weeks: { weekNo: number; start: string; end: string }[];
  rows: CosLedgerPurchaseRow[];
  /** Ledger accounts linked to this cost centre in Settings. */
  ledgerCount: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParams(patch: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.push(`?${next.toString()}`);
  }

  const totals = rows.reduce(
    (t, r) => ({ gross: t.gross + r.gross, net: t.net + r.net }),
    { gross: 0, net: 0 },
  );
  const monthWeeks = weeksInMonth(monthIndex);
  const periodLabel =
    scope === "month"
      ? `${MONTH_LABELS[monthIndex]} ${fiscalYear} · W${monthWeeks[0]}–W${monthWeeks[monthWeeks.length - 1]} · ${ddmmyy(from)} to ${ddmmyy(to)}`
      : `W${weekNo} · ${ddmmyy(from)} to ${ddmmyy(to)}`;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="inline-flex rounded-lg bg-black/[0.04] p-1">
          {(
            [
              ["week", "Week"],
              ["month", "Month"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setParams({ scope: value })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                scope === value
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-black/60 hover:text-black",
              )}
            >
              {text}
            </button>
          ))}
        </div>
        <select
          value={fiscalYear}
          onChange={(e) => setParams({ year: e.target.value })}
          className={selectClass}
          aria-label="Year"
        >
          {[fiscalYear - 1, fiscalYear, fiscalYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {scope === "week" ? (
          <select
            value={weekNo}
            onChange={(e) => setParams({ week: e.target.value })}
            className={selectClass}
            aria-label="Week"
          >
            {weeks.map((w) => (
              <option key={w.weekNo} value={w.weekNo}>
                W{w.weekNo} - {ddmmyy(w.start)} to {ddmmyy(w.end)}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={monthIndex}
            onChange={(e) => setParams({ month: e.target.value })}
            className={selectClass}
            aria-label="Month"
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-black/45">
          Approved &amp; posted supplier invoices · {ledgerCount} ledger
          {ledgerCount === 1 ? "" : "s"} linked
        </span>
      </Card>

      {ledgerCount === 0 ? (
        <Card className="p-6 text-sm text-black/60">
          <h3 className="font-serif text-lg text-[#3D421F]">
            No ledger accounts linked
          </h3>
          <p className="mt-2">
            Link the ledger accounts that hold{" "}
            {COST_CENTRE_LABELS[centre].toLowerCase()} purchases in{" "}
            <ScopedLink
              href="/gp-cos/settings"
              className="font-medium text-[var(--venue-primary,#818a40)] hover:underline"
            >
              GP &amp; COS Settings → Ledger accounts
            </ScopedLink>
            .
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-black/5 p-4">
            <h3 className="font-serif text-lg text-[#3D421F]">{periodLabel}</h3>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--venue-secondary,#F0F3DD)]">
                <tr className="border-b border-black/10 text-xs font-bold uppercase tracking-wide text-black">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-left">Invoice no.</th>
                  <th className="px-3 py-2 text-right">Value gross</th>
                  <th className="px-3 py-2 text-right">Value net</th>
                  <th className="px-3 py-2 text-left">Ledger account</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-10 text-center text-black/45"
                    >
                      No purchases recorded on the linked ledgers in this
                      period.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.key} className="border-b border-black/5">
                      <td className="whitespace-nowrap px-3 py-2">
                        {ddmmyy(r.date)}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#3D421F]">
                        {r.supplierName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.supplierInvoiceNo || "—"}
                        {r.invoiceNo ? (
                          <div className="text-[11px] text-black/40">
                            {r.invoiceNo}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {MONEY(r.gross)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {MONEY(r.net)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-black/55">
                          {r.ledgerCode}
                        </span>{" "}
                        {r.ledgerName}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 ? (
                <tfoot>
                  <tr className="border-t border-black/15 bg-black/[0.03] font-semibold text-[#3D421F]">
                    <td colSpan={3} className="px-3 py-2">
                      Total · {rows.length} line{rows.length === 1 ? "" : "s"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {MONEY(totals.gross)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {MONEY(totals.net)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
