"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import type { ApInvoice, TaxCode } from "@/lib/accounting/ap-types";
import {
  computeApInsights,
  type ApInsightLine,
  type ApInsights,
} from "@/lib/accounting/ap-insights";
import { formatAedAccounting } from "@/lib/accounting/money";

type Props = {
  initial: ApInsights;
  periodFrom: string;
  periodTo: string;
  invoices: ApInvoice[];
  lines: ApInsightLine[];
  taxCodes: TaxCode[];
};

export function ApInsightsClient({
  initial,
  periodFrom: initialFrom,
  periodTo: initialTo,
  invoices,
  lines,
  taxCodes,
}: Props) {
  const [periodFrom, setPeriodFrom] = useState(initialFrom);
  const [periodTo, setPeriodTo] = useState(initialTo);

  const insights = useMemo(() => {
    if (periodFrom === initialFrom && periodTo === initialTo) return initial;
    return computeApInsights({
      invoices,
      lines,
      taxCodes,
      periodFrom,
      periodTo,
    });
  }, [
    periodFrom,
    periodTo,
    initialFrom,
    initialTo,
    initial,
    invoices,
    lines,
    taxCodes,
  ]);

  const agingData = [
    { bucket: "Current", amount: insights.aging.current },
    { bucket: "1–30", amount: insights.aging.d1_30 },
    { bucket: "31–60", amount: insights.aging.d31_60 },
    { bucket: "61–90", amount: insights.aging.d61_90 },
    { bucket: "90+", amount: insights.aging.d90_plus },
  ];

  const funnelData = Object.entries(insights.statusFunnel).map(
    ([status, count]) => ({ status, count }),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>From</Label>
          <DateInput
            id="insights-from"
            value={periodFrom}
            onChange={setPeriodFrom}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <DateInput
            id="insights-to"
            value={periodTo}
            onChange={setPeriodTo}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Purchases (period)"
          value={formatAedAccounting(insights.totalPurchases)}
          hint={
            insights.momTrendPct == null
              ? "No prior month"
              : `MoM ${insights.momTrendPct > 0 ? "+" : ""}${insights.momTrendPct}%`
          }
        />
        <Stat
          label="Recoverable input VAT"
          value={formatAedAccounting(insights.recoverableVat)}
        />
        <Stat
          label="Blocked / non-recoverable"
          value={formatAedAccounting(insights.blockedVat)}
        />
        <Stat
          label="Avg approval time"
          value={
            insights.avgApprovalHours == null
              ? "—"
              : `${insights.avgApprovalHours}h`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Spend by supplier">
          {insights.spendBySupplier.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {insights.spendBySupplier.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate text-[#3D421F]">{row.name}</span>
                  <span className="tabular-nums text-black/60">
                    {formatAedAccounting(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Spend by account">
          {insights.spendByAccount.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {insights.spendByAccount.map((row) => (
                <li
                  key={row.code}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate text-[#3D421F]">
                    {row.code} · {row.name}
                  </span>
                  <span className="tabular-nums text-black/60">
                    {formatAedAccounting(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="AP aging (posted)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000014" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v) => formatAedAccounting(Number(v ?? 0))}
                />
                <Bar dataKey="amount" fill="var(--venue-primary, #818a40)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Status funnel">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000014" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3D421F" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {insights.anomalyFlags.length > 0 ? (
        <Panel title="Duplicate / anomaly flags">
          <ul className="space-y-1.5 text-sm text-amber-900">
            {insights.anomalyFlags.map((f) => (
              <li key={`${f.id}-${f.reason}`}>
                <span className="font-medium">{f.invoice_no}</span> — {f.reason}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-black/45">{label}</p>
      <p className="mt-1 font-serif text-2xl text-[#3D421F]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-black/45">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <h3 className="mb-3 font-serif text-lg text-[#3D421F]">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-black/45">No posted invoices in period.</p>;
}
