"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  CASH_FLOW_PERIODS,
  EXPENSE_PERIODS,
  expenseEmptyMessage,
  formatCashFlowAmount,
  resolveCashFlowWindow,
  type CashFlowPeriod,
  type ExpensePeriod,
  type MonthTick,
} from "@/lib/accounting/cash-flow-periods";
import { roundMoney } from "@/lib/accounting/money";
import {
  gsByMonthTick,
  sumGsForMonthTicks,
  type AccountingRevenueDay,
} from "@/lib/accounting/revenue-from-sales";
import { cn } from "@/lib/utils";

const CURRENT = "#3B82F6";
const OVERDUE = "#F59E0B";
const INCOMING = "#22A06B";
const OUTGOING = "#E5484D";
const OPENING = "#C5C8D0";
const EMPTY_AXIS_MAX = 5000;

const RECEIVABLE_ACTIONS = [
  "New Invoice",
  "New Recurring Invoice",
  "New Customer Payment",
] as const;

const PAYABLE_ACTIONS = [
  "New Bill",
  "New Vendor Payment",
  "New Recurring Bill",
] as const;

const OVERDUE_BUCKETS = [
  "1–15 Days",
  "16–30 Days",
  "31–45 Days",
  "Above 45 Days",
] as const;

type Basis = "accrual" | "cash";

type Props = {
  /** ISO date the period windows are calculated from. */
  asOf: string;
  /** Daily gross sales. These totals are receivables and income. */
  revenueDays?: AccountingRevenueDay[];
};

export function CashFlowDashboard({ asOf, revenueDays = [] }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [cashPeriod, setCashPeriod] = useState<CashFlowPeriod>("this-fiscal-year");
  const [incomePeriod, setIncomePeriod] =
    useState<CashFlowPeriod>("this-fiscal-year");
  const [expensePeriod, setExpensePeriod] =
    useState<ExpensePeriod>("this-fiscal-year");
  const [basis, setBasis] = useState<Basis>("accrual");

  const cashWindow = resolveCashFlowWindow(cashPeriod, asOf);
  const incomeWindow = resolveCashFlowWindow(incomePeriod, asOf);
  const receivableWindow = resolveCashFlowWindow("this-fiscal-year", asOf);
  const cashMonthlyGs = gsByMonthTick(revenueDays, cashWindow.points);
  const incomeMonthlyGs = gsByMonthTick(revenueDays, incomeWindow.points);
  const cashIncomingGs = roundMoney(
    cashMonthlyGs.reduce((sum, value) => sum + value, 0),
    2,
  );
  const incomeGs = roundMoney(
    incomeMonthlyGs.reduce((sum, value) => sum + value, 0),
    2,
  );
  const receivablesGs = sumGsForMonthTicks(revenueDays, receivableWindow.points);
  const cashCumulativeGs = cumulative(cashMonthlyGs);

  function toggleMenu(id: string) {
    setOpenMenu((current) => (current === id ? null : id));
  }

  function closeMenu() {
    setOpenMenu(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <BalanceCard
          title="Total Receivables"
          subtitle="Daily sales GS this fiscal year"
          menuId="receivables-new"
          openMenu={openMenu}
          onToggleMenu={toggleMenu}
          onCloseMenu={closeMenu}
          actions={RECEIVABLE_ACTIONS}
          total={receivablesGs}
          current={receivablesGs}
          overdue={0}
        />
        <BalanceCard
          title="Total Payables"
          subtitle="Total Unpaid Bills"
          menuId="payables-new"
          openMenu={openMenu}
          onToggleMenu={toggleMenu}
          onCloseMenu={closeMenu}
          actions={PAYABLE_ACTIONS}
          total={0}
          current={0}
          overdue={0}
        />
      </div>

      <Card className="bg-white p-0">
        <WidgetHeader
          title="Cash Flow"
          open={openMenu === "cash-period"}
          label={periodLabel(CASH_FLOW_PERIODS, cashPeriod)}
          onToggle={() => toggleMenu("cash-period")}
          onClose={closeMenu}
        >
          <PeriodMenu
            options={CASH_FLOW_PERIODS}
            value={cashPeriod}
            onSelect={(value) => {
              setCashPeriod(value);
              closeMenu();
            }}
          />
        </WidgetHeader>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_13.5rem] md:items-center md:px-5">
          <MonthSeriesChart
            points={cashWindow.points}
            values={cashCumulativeGs}
            stroke={INCOMING}
          />
          <CashFlowLegend
            openingLabel={cashWindow.openingLabel}
            closingLabel={cashWindow.closingLabel}
            incoming={cashIncomingGs}
            closing={cashIncomingGs}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <Card className="flex h-full flex-col bg-white p-0">
          <WidgetHeader
            title="Income and Expense"
            open={openMenu === "income-period"}
            label={periodLabel(CASH_FLOW_PERIODS, incomePeriod)}
            onToggle={() => toggleMenu("income-period")}
            onClose={closeMenu}
          >
            <PeriodMenu
              options={CASH_FLOW_PERIODS}
              value={incomePeriod}
              onSelect={(value) => {
                setIncomePeriod(value);
                closeMenu();
              }}
            />
          </WidgetHeader>
          <div className="flex flex-1 flex-col px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap gap-8">
                <AmountStat label="Total Income" color={INCOMING} amount={incomeGs} />
                <AmountStat label="Total Expenses" color={OUTGOING} amount={0} />
              </div>
              <BasisToggle basis={basis} onChange={setBasis} />
            </div>
            <div className="mt-4">
              <MonthSeriesChart
                points={incomeWindow.points}
                values={incomeMonthlyGs}
                stroke={INCOMING}
              />
            </div>
            <p className="mt-3 text-xs text-black/40">
              * Income is gross daily sales (GS) from Revenue, inclusive of tax.
            </p>
          </div>
        </Card>

        <Card className="flex h-full min-h-72 flex-col bg-white p-0">
          <WidgetHeader
            title="Top Expenses"
            open={openMenu === "expense-period"}
            label={periodLabel(EXPENSE_PERIODS, expensePeriod)}
            onToggle={() => toggleMenu("expense-period")}
            onClose={closeMenu}
          >
            <PeriodMenu
              options={EXPENSE_PERIODS}
              value={expensePeriod}
              onSelect={(value) => {
                setExpensePeriod(value);
                closeMenu();
              }}
            />
          </WidgetHeader>
          <div className="flex flex-1 items-center justify-center px-6 py-16">
            <p className="text-center text-sm text-black/40">
              {expenseEmptyMessage(expensePeriod)}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function BalanceCard({
  title,
  subtitle,
  menuId,
  openMenu,
  onToggleMenu,
  onCloseMenu,
  actions,
  total,
  current,
  overdue,
}: {
  title: string;
  subtitle: string;
  menuId: string;
  openMenu: string | null;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  actions: readonly string[];
  total: number;
  current: number;
  overdue: number;
}) {
  const overdueMenuId = `${menuId}-overdue`;
  const currentPct = total > 0 ? (current / total) * 100 : 0;
  const overduePct = total > 0 ? (overdue / total) * 100 : 0;

  return (
    <Card className="bg-white p-0">
      <div className="flex items-center justify-between gap-3 rounded-t-xl border-b border-black/5 bg-[var(--venue-secondary,#F0F3DD)]/70 px-4 py-3">
        <h2 className="font-serif text-base font-semibold text-[#3D421F]">
          {title}
        </h2>
        <MenuAnchor
          open={openMenu === menuId}
          onClose={onCloseMenu}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--venue-primary,#818a40)] hover:opacity-80"
              aria-expanded={openMenu === menuId}
              aria-haspopup="menu"
              onClick={() => onToggleMenu(menuId)}
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              New
            </button>
          }
        >
          <ActionMenu actions={actions} onPick={onCloseMenu} />
        </MenuAnchor>
      </div>

      <div className="px-4 py-4 md:px-5">
        <p className="text-sm text-black/50">{subtitle}</p>
        <p className="mt-1 font-serif text-2xl font-semibold tracking-tight text-[#3D421F]">
          {formatCashFlowAmount(total)}
        </p>
        <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full"
            style={{ width: `${currentPct}%`, backgroundColor: CURRENT }}
          />
          <div
            className="h-full"
            style={{ width: `${overduePct}%`, backgroundColor: OVERDUE }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#3D421F]">
          <span className="inline-flex items-center gap-1.5">
            <Dot color={CURRENT} />
            Current : {formatCashFlowAmount(current)}
          </span>
          <MenuAnchor
            open={openMenu === overdueMenuId}
            onClose={onCloseMenu}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-black/[0.04]"
                aria-expanded={openMenu === overdueMenuId}
                aria-haspopup="menu"
                onClick={() => onToggleMenu(overdueMenuId)}
              >
                <Dot color={OVERDUE} />
                Overdue : {formatCashFlowAmount(0)}
                <ChevronDown className="size-3.5 text-black/45" />
              </button>
            }
          >
            <div className="w-56 py-1" role="menu">
              {OVERDUE_BUCKETS.map((bucket) => (
                <div
                  key={bucket}
                  className="flex items-center justify-between px-3 py-2 text-sm text-[#3D421F]"
                  role="menuitem"
                >
                  <span>{bucket}</span>
                  <span className="tabular-nums text-black/70">
                    {formatCashFlowAmount(0)}
                  </span>
                </div>
              ))}
            </div>
          </MenuAnchor>
        </div>
      </div>
    </Card>
  );
}

function WidgetHeader({
  title,
  open,
  label,
  onToggle,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  label: string;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-t-xl border-b border-black/5 bg-[var(--venue-secondary,#F0F3DD)]/70 px-4 py-3">
      <h2 className="font-serif text-base font-semibold text-[#3D421F]">
        {title}
      </h2>
      <MenuAnchor
        open={open}
        onClose={onClose}
        trigger={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-black/55 hover:text-[#3D421F]"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={onToggle}
          >
            {label}
            <ChevronDown className="size-3.5" />
          </button>
        }
      >
        {children}
      </MenuAnchor>
    </div>
  );
}

function PeriodMenu<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="w-56 py-1" role="menu">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className={cn(
              "flex w-full px-3 py-2.5 text-left text-sm",
              selected
                ? "bg-[var(--venue-primary,#818a40)] font-medium text-white"
                : "text-[#3D421F] hover:bg-[var(--venue-primary,#818a40)] hover:text-white",
            )}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ActionMenu({
  actions,
  onPick,
}: {
  actions: readonly string[];
  onPick: () => void;
}) {
  return (
    <div className="w-60 py-1" role="menu">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#3D421F] hover:bg-[var(--venue-primary,#818a40)] hover:text-white"
          onClick={onPick}
        >
          <Plus
            className="size-4 text-[var(--venue-primary,#818a40)] group-hover:text-white"
            strokeWidth={2.25}
          />
          {action}
        </button>
      ))}
    </div>
  );
}

function MenuAnchor({
  open,
  onClose,
  trigger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setPosition(placeMenu(anchor.getBoundingClientRect()));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  return (
    <div ref={anchorRef} className="relative">
      {trigger}
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              style={{
                position: "fixed",
                right: position.right,
                top: position.top,
                maxHeight: position.maxHeight,
              }}
              className="z-50 overflow-y-auto rounded-lg border border-black/10 bg-white shadow-lg"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type MenuPosition = {
  top: number;
  right: number;
  maxHeight: number;
};

function placeMenu(rect: DOMRect): MenuPosition {
  const margin = 8;
  const estimatedHeight = 320;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const maxHeight = Math.max(160, openUp ? spaceAbove : spaceBelow);
  const top = openUp
    ? Math.max(margin, rect.top - margin - Math.min(estimatedHeight, maxHeight))
    : rect.bottom + margin;
  return {
    top,
    right: Math.max(margin, window.innerWidth - rect.right),
    maxHeight,
  };
}

function AmountStat({
  label,
  color,
  amount,
}: {
  label: string;
  color: string;
  amount: number;
}) {
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 text-sm text-black/60">
        <Dot color={color} />
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#3D421F]">
        {formatCashFlowAmount(amount)}
      </p>
    </div>
  );
}

function BasisToggle({
  basis,
  onChange,
}: {
  basis: Basis;
  onChange: (basis: Basis) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-black/10 bg-black/[0.03] p-0.5"
      role="group"
      aria-label="Income basis"
    >
      <BasisButton
        active={basis === "accrual"}
        onClick={() => onChange("accrual")}
      >
        Accrual
      </BasisButton>
      <BasisButton active={basis === "cash"} onClick={() => onChange("cash")}>
        Cash
      </BasisButton>
    </div>
  );
}

function BasisButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-7 rounded px-2.5 text-xs font-medium",
        active
          ? "bg-white text-[#3D421F] shadow-sm"
          : "text-black/45 hover:text-[#3D421F]",
      )}
    >
      {children}
    </button>
  );
}

function CashFlowLegend({
  openingLabel,
  closingLabel,
  incoming,
  closing,
}: {
  openingLabel: string;
  closingLabel: string;
  incoming: number;
  closing: number;
}) {
  return (
    <dl className="space-y-4 md:pl-2">
      <LegendRow
        color={OPENING}
        label={`Cash as on ${openingLabel}`}
        value={formatCashFlowAmount(0)}
      />
      <LegendRow
        color={INCOMING}
        label="Incoming"
        value={`${formatCashFlowAmount(incoming)} ( + )`}
      />
      <LegendRow
        color={OUTGOING}
        label="Outgoing"
        value={`${formatCashFlowAmount(0)} ( - )`}
      />
      <LegendRow
        color={CURRENT}
        label={`Cash as on ${closingLabel}`}
        value={`${formatCashFlowAmount(closing)} ( = )`}
      />
    </dl>
  );
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2">
      <Dot color={color} className="mt-1" />
      <div>
        <dt className="text-xs text-black/50">{label}</dt>
        <dd className="text-sm font-semibold tabular-nums text-[#3D421F]">
          {value}
        </dd>
      </div>
    </div>
  );
}

function MonthSeriesChart({
  points,
  values,
  stroke,
}: {
  points: MonthTick[];
  values: number[];
  stroke: string;
}) {
  const data = points.map((point, index) => ({
    label: `${point.month}|${point.year}`,
    value: values[index] ?? 0,
  }));
  const peak = data.reduce((max, point) => Math.max(max, point.value), 0);
  const empty = peak <= 0;
  const max = empty ? EMPTY_AXIS_MAX : axisMax(peak);
  const ticks = empty
    ? [0, 1000, 2000, 3000, 4000, 5000]
    : [0, 0.25, 0.5, 0.75, 1].map((step) => Math.round(max * step));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(0,0,0,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "rgba(0,0,0,0.12)" }}
            height={44}
            padding={{ left: 8, right: 8 }}
            tick={renderMonthTick}
          />
          <YAxis
            domain={[0, max]}
            ticks={ticks}
            tickFormatter={formatAxisTick}
            tick={{ fontSize: 11, fill: "rgba(61,66,31,0.55)" }}
            axisLine={false}
            tickLine={false}
            width={48}
            allowDataOverflow
          />
          <Line
            dataKey="value"
            stroke={empty ? "transparent" : stroke}
            strokeWidth={2}
            dot={empty ? false : { r: 3, fill: stroke, strokeWidth: 0 }}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function cumulative(values: number[]): number[] {
  let running = 0;
  return values.map((value) => {
    running = roundMoney(running + value, 2);
    return running;
  });
}

function axisMax(peak: number): number {
  const padded = peak * 1.1;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  return Math.ceil(padded / magnitude) * magnitude;
}

function renderMonthTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string };
}) {
  const x = props.x ?? 0;
  const y = Number(props.y ?? 0);
  const [month, year] = String(props.payload?.value ?? "").split("|");
  return (
    <text textAnchor="middle" fill="rgba(61,66,31,0.55)" fontSize={11}>
      <tspan x={x} y={y + 12}>
        {month}
      </tspan>
      <tspan x={x} y={y + 25}>
        {year}
      </tspan>
    </text>
  );
}

function formatAxisTick(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    const rounded = Math.round(millions * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded} M` : `${rounded.toFixed(1)} M`;
  }
  const thousands = value / 1000;
  const rounded = Math.round(thousands * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} K` : `${rounded.toFixed(1)} K`;
}

function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", className)}
      style={{ backgroundColor: color }}
    />
  );
}

function periodLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
