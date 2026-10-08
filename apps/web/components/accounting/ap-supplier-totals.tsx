"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/toast";
import { saveSupplierTotalsSelection } from "@/lib/actions/accounting-ap-supplier-totals";
import type {
  SupplierTotalsData,
  SupplierTotalsSupplier,
} from "@/lib/accounting/ap-supplier-totals";

const money = (n: number) =>
  Math.abs(n) < 0.005
    ? "–"
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ISO date → DD/MM. */
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const label = (s: SupplierTotalsSupplier) => s.nickname?.trim() || s.name;

/**
 * Expenses → Suppliers Totals: one grid per year — supplier columns, week
 * rows, net totals. The column list is shared by everyone at the venue.
 */
export function ApSupplierTotals({
  data,
  currentYear,
  canEdit,
}: {
  data: SupplierTotalsData;
  currentYear: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const byId = useMemo(
    () => new Map(data.suppliers.map((s) => [s.id, s])),
    [data.suppliers],
  );
  const yearTotal = (id: string) =>
    Object.values(data.totals[id] ?? {}).reduce((a, b) => a + b, 0);

  // Until a list is saved, show every supplier with purchases, largest first.
  const defaultColumns = useMemo(
    () =>
      Object.keys(data.totals)
        .filter((id) => byId.has(id))
        .sort((a, b) => yearTotal(b) - yearTotal(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.totals, byId],
  );
  const [columns, setColumns] = useState<string[]>(
    (data.selection ?? defaultColumns).filter((id) => byId.has(id)),
  );

  function persist(next: string[]) {
    const previous = columns;
    setColumns(next);
    startTransition(async () => {
      const res = await saveSupplierTotalsSelection(next);
      if (!res.ok) {
        setColumns(previous);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  const options = data.suppliers
    .filter((s) => !columns.includes(s.id))
    .map((s) => ({
      value: s.id,
      label: label(s),
      searchText: `${s.name} ${s.nickname ?? ""} ${s.ledger ?? ""}`,
      dropdownLabel: (
        <span className="flex flex-col">
          <span className="text-[#3D421F]">{label(s)}</span>
          <span className="text-[11px] text-black/45">
            {s.nickname && s.nickname !== s.name ? `${s.name} · ` : ""}
            {s.ledger ?? "No default ledger"}
          </span>
        </span>
      ),
    }));

  const rows = [...data.weeks].reverse();
  const visibleTotal = columns.reduce((t, id) => t + yearTotal(id), 0);
  const pct = (n: number) =>
    data.grandTotal ? `${((n / data.grandTotal) * 100).toFixed(1)}%` : "—";

  function changeYear(year: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("year", year);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#3D421F]">Year</label>
          <select
            value={data.fiscalYear}
            onChange={(e) => changeYear(e.target.value)}
            className="flex h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]"
            aria-label="Year"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {canEdit ? (
          <div className="min-w-[260px] flex-1 space-y-1.5 sm:max-w-md">
            <label className="text-xs font-medium text-[#3D421F]">
              Add supplier to the view
            </label>
            <SearchableSelect
              value=""
              onChange={(id) => id && persist([...columns, id])}
              options={options}
              placeholder="Search by supplier or ledger account…"
              searchPlaceholder="Supplier name, nickname or ledger…"
              clearable={false}
              disabled={pending}
              aria-label="Add supplier"
            />
          </div>
        ) : null}
        <p className="ml-auto text-xs text-black/45">
          Net of VAT · posted documents · credit notes deducted · list shared
          with everyone
        </p>
      </div>

      {columns.length === 0 ? (
        <div className="rounded-lg border border-black/10 bg-white p-10 text-center text-sm text-black/45">
          No suppliers in the view yet — add one above.
        </div>
      ) : (
        <div className="max-h-[75vh] overflow-auto rounded-lg border border-black/10 bg-white">
          <table className="border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F]">
                <th className="sticky left-0 z-30 min-w-[150px] border-b border-r border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-3 py-2 text-left align-bottom text-xs font-bold uppercase tracking-wide">
                  Week
                </th>
                {columns.map((id) => {
                  const s = byId.get(id)!;
                  const total = yearTotal(id);
                  return (
                    <th
                      key={id}
                      className="min-w-[130px] border-b border-r border-black/10 px-3 py-2 text-right align-bottom font-normal"
                      title={`${s.name}${s.ledger ? ` · ${s.ledger}` : ""}`}
                    >
                      <div className="flex items-start justify-end gap-1">
                        <span className="text-xs font-bold uppercase tracking-wide">
                          {label(s)}
                        </span>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => persist(columns.filter((c) => c !== id))}
                            disabled={pending}
                            className="rounded p-0.5 text-black/35 hover:bg-black/5 hover:text-red-700"
                            aria-label={`Remove ${label(s)}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm font-semibold tabular-nums">
                        {money(total)}
                      </div>
                      <div className="text-[11px] tabular-nums text-black/50">
                        {pct(total)}
                      </div>
                    </th>
                  );
                })}
                <th className="min-w-[130px] border-b border-black/10 bg-black/[0.04] px-3 py-2 text-right align-bottom font-normal">
                  <div className="text-xs font-bold uppercase tracking-wide">Total</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums">
                    {money(visibleTotal)}
                  </div>
                  <div className="text-[11px] tabular-nums text-black/50">
                    {pct(visibleTotal)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const rowTotal = columns.reduce(
                  (t, id) => t + (data.totals[id]?.[w.weekNo] ?? 0),
                  0,
                );
                return (
                  <tr key={w.weekNo} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="sticky left-0 z-10 whitespace-nowrap border-r border-black/10 bg-white px-3 py-1.5 text-left">
                      <span className="font-semibold text-[#3D421F]">W{w.weekNo}</span>
                      <span className="ml-2 text-xs tabular-nums text-black/50">
                        {ddmm(w.start)} – {ddmm(w.end)}
                      </span>
                    </td>
                    {columns.map((id) => {
                      const v = data.totals[id]?.[w.weekNo] ?? 0;
                      return (
                        <td
                          key={id}
                          className={`border-r border-black/5 px-3 py-1.5 text-right tabular-nums ${
                            v < 0 ? "text-red-700" : v ? "text-[#3D421F]" : "text-black/25"
                          }`}
                        >
                          {money(v)}
                        </td>
                      );
                    })}
                    <td className="bg-black/[0.02] px-3 py-1.5 text-right font-medium tabular-nums text-[#3D421F]">
                      {money(rowTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-black/45">
        % = share of all supplier purchases in {data.fiscalYear} (
        {money(data.grandTotal)} net).
        {data.selection == null && columns.length
          ? " Showing every supplier with purchases until the list is changed."
          : ""}
      </p>
    </div>
  );
}
