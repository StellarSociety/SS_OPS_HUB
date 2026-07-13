"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  saveVenueDailySalesEntry,
  saveVenueDailyTenderTotals,
} from "@/lib/actions/sales";
import {
  computeDailySales,
  formatCount,
  formatMoney,
  formatPct,
  grossToNet,
  netToGross,
} from "@/lib/sales/daily-sales-calculations";
import type {
  VenueDailySalesInputField,
  VenueDailySalesRecord,
  VenueSalesTaxSettings,
} from "@/lib/sales/daily-sales-types";
import type { VenueTender } from "@/lib/sales/tenders-types";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import type { VenueDailyTenderTotal } from "@/lib/sales/daily-tender-totals-store";
import {
  canCreateSalesEntryForDate,
  FUTURE_SALES_ENTRY_ERROR,
  isFutureSalesEntryDate,
} from "@/lib/sales/sales-entry-dates";
import { SalesEntryDateBar } from "@/components/sales/sales-entry-date-bar";
import { SalesEntryDateBanner } from "@/components/sales/sales-entry-date-banner";
import {
  SalesFormColumnsLayout,
  SalesFormFieldRow,
  SalesFormInputModeToggle,
  SalesFormSectionHeader,
  salesFormColumnClassName,
  salesFormColumnShellClass,
  salesFormColumnWidthClass,
} from "@/components/sales/sales-form-field-row";
import { SalesNumericInput } from "@/components/sales/sales-numeric-input";
import { useSalesFormUnsavedGuard } from "@/components/sales/use-sales-form-unsaved-guard";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type DailySalesEntryFormProps = {
  records: VenueDailySalesRecord[];
  tenders: VenueTender[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  tenderTotals: VenueDailyTenderTotal[];
  totalTaxPct: number;
  taxSettings: VenueSalesTaxSettings;
  canEdit: boolean;
};

type SalesInputMode = "gross" | "net";

// Tolerance (in currency units) to absorb per-line rounding drift when
// comparing independently-rounded totals. A couple of cents keeps genuinely
// balanced days from flagging on rounding artifacts (e.g. -0.01).
const ROUNDING_TOLERANCE = 0.02;

type FormState = {
  id: string;
  sale_date: string;
  lunch_food_gs: number;
  lunch_beverages_gs: number;
  lunch_wine_gs: number;
  lunch_shisha_gs: number;
  lunch_tobacco_gs: number;
  lunch_others_gs: number;
  lunch_service_fees_gs: number;
  lunch_covers: number;
  lunch_bookings: number;
  lunch_walkin_tables: number;
  lunch_walkin_covers: number;
  dinner_food_gs: number;
  dinner_beverages_gs: number;
  dinner_wine_gs: number;
  dinner_shisha_gs: number;
  dinner_tobacco_gs: number;
  dinner_others_gs: number;
  dinner_service_fees_gs: number;
  dinner_covers: number;
  dinner_bookings: number;
  dinner_walkin_tables: number;
  dinner_walkin_covers: number;
  all_day_discount_gs: number;
  vat_collected_gs: number;
  municipality_fee_collected_gs: number;
  service_charge_collected_gs: number;
  tender_totals: Record<string, number>;
};

const LUNCH_SALES_FIELDS: {
  key: VenueDailySalesInputField;
  label: string;
}[] = [
  { key: "lunch_food_gs", label: "Food" },
  { key: "lunch_beverages_gs", label: "Beverages" },
  { key: "lunch_wine_gs", label: "Wine" },
  { key: "lunch_shisha_gs", label: "Shisha" },
  { key: "lunch_tobacco_gs", label: "Tobacco" },
  { key: "lunch_others_gs", label: "Others" },
  { key: "lunch_service_fees_gs", label: "Service Fees" },
];

const DINNER_SALES_FIELDS: {
  key: VenueDailySalesInputField;
  label: string;
}[] = [
  { key: "dinner_food_gs", label: "Food" },
  { key: "dinner_beverages_gs", label: "Beverages" },
  { key: "dinner_wine_gs", label: "Wine" },
  { key: "dinner_shisha_gs", label: "Shisha" },
  { key: "dinner_tobacco_gs", label: "Tobacco" },
  { key: "dinner_others_gs", label: "Others" },
  { key: "dinner_service_fees_gs", label: "Service Fees" },
];

function emptyTenderTotals(tenderIds: string[]): Record<string, number> {
  return Object.fromEntries(tenderIds.map((id) => [id, 0]));
}

function emptyForm(date: string, tenderIds: string[]): FormState {
  return {
    id: "",
    sale_date: date,
    lunch_food_gs: 0,
    lunch_beverages_gs: 0,
    lunch_wine_gs: 0,
    lunch_shisha_gs: 0,
    lunch_tobacco_gs: 0,
    lunch_others_gs: 0,
    lunch_service_fees_gs: 0,
    lunch_covers: 0,
    lunch_bookings: 0,
    lunch_walkin_tables: 0,
    lunch_walkin_covers: 0,
    dinner_food_gs: 0,
    dinner_beverages_gs: 0,
    dinner_wine_gs: 0,
    dinner_shisha_gs: 0,
    dinner_tobacco_gs: 0,
    dinner_others_gs: 0,
    dinner_service_fees_gs: 0,
    dinner_covers: 0,
    dinner_bookings: 0,
    dinner_walkin_tables: 0,
    dinner_walkin_covers: 0,
    all_day_discount_gs: 0,
    vat_collected_gs: 0,
    municipality_fee_collected_gs: 0,
    service_charge_collected_gs: 0,
    tender_totals: emptyTenderTotals(tenderIds),
  };
}

function recordToForm(
  record: VenueDailySalesRecord,
  tenderTotals: Record<string, number>,
): FormState {
  return {
    id: record.id,
    sale_date: record.sale_date,
    lunch_food_gs: record.lunch_food_gs,
    lunch_beverages_gs: record.lunch_beverages_gs,
    lunch_wine_gs: record.lunch_wine_gs,
    lunch_shisha_gs: record.lunch_shisha_gs,
    lunch_tobacco_gs: record.lunch_tobacco_gs ?? 0,
    lunch_others_gs: record.lunch_others_gs,
    lunch_service_fees_gs: record.lunch_service_fees_gs ?? 0,
    lunch_covers: record.lunch_covers,
    lunch_bookings: record.lunch_bookings,
    lunch_walkin_tables: record.lunch_walkin_tables ?? 0,
    lunch_walkin_covers: record.lunch_walkin_covers ?? 0,
    dinner_food_gs: record.dinner_food_gs,
    dinner_beverages_gs: record.dinner_beverages_gs,
    dinner_wine_gs: record.dinner_wine_gs,
    dinner_shisha_gs: record.dinner_shisha_gs,
    dinner_tobacco_gs: record.dinner_tobacco_gs ?? 0,
    dinner_others_gs: record.dinner_others_gs,
    dinner_service_fees_gs: record.dinner_service_fees_gs ?? 0,
    dinner_covers: record.dinner_covers,
    dinner_bookings: record.dinner_bookings,
    dinner_walkin_tables: record.dinner_walkin_tables ?? 0,
    dinner_walkin_covers: record.dinner_walkin_covers ?? 0,
    all_day_discount_gs: record.all_day_discount_gs ?? 0,
    vat_collected_gs: record.vat_collected_gs ?? 0,
    municipality_fee_collected_gs: record.municipality_fee_collected_gs ?? 0,
    service_charge_collected_gs: record.service_charge_collected_gs ?? 0,
    tender_totals: tenderTotals,
  };
}

function formatDifference(value: number): string {
  if (value === 0) return formatMoney(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function InputModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: SalesInputMode;
  onChange: (mode: SalesInputMode) => void;
  disabled: boolean;
}) {
  return (
    <SalesFormInputModeToggle
      mode={mode}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

function ServiceColumn({
  title,
  salesFields,
  coversKey,
  bookingsKey,
  walkinTablesKey,
  walkinCoversKey,
  form,
  canEdit,
  inputMode,
  totalTaxPct,
  onInputModeChange,
  onChange,
}: {
  title: string;
  salesFields: { key: VenueDailySalesInputField; label: string }[];
  coversKey: VenueDailySalesInputField;
  bookingsKey: VenueDailySalesInputField;
  walkinTablesKey: VenueDailySalesInputField;
  walkinCoversKey: VenueDailySalesInputField;
  form: FormState;
  canEdit: boolean;
  inputMode: SalesInputMode;
  totalTaxPct: number;
  onInputModeChange: (mode: SalesInputMode) => void;
  onChange: (field: VenueDailySalesInputField, value: string) => void;
}) {
  function displayValue(gross: number): number {
    if (inputMode === "gross") return gross;
    return Math.round(grossToNet(gross, totalTaxPct) * 100) / 100;
  }

  function handleSalesChange(field: VenueDailySalesInputField, raw: string) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      onChange(field, "0");
      return;
    }

    const gross =
      inputMode === "gross"
        ? parsed
        : Math.round(netToGross(parsed, totalTaxPct) * 100) / 100;
    onChange(field, String(gross));
  }

  return (
    <div className={salesFormColumnClassName()}>
      <SalesFormSectionHeader
        title={title}
        action={
          <InputModeToggle
            mode={inputMode}
            onChange={onInputModeChange}
            disabled={!canEdit}
          />
        }
      />
      <div className="flex flex-1 flex-col space-y-2">
        {salesFields.map((field) => (
          <SalesFormFieldRow key={field.key} label={field.label}>
            <SalesNumericInput
              key={`${field.key}-${form.id}-${form.sale_date}-${inputMode}`}
              value={displayValue(form[field.key])}
              disabled={!canEdit}
              onChange={(v) => handleSalesChange(field.key, v)}
            />
          </SalesFormFieldRow>
        ))}
        <div className="space-y-2 border-t border-black/10 pt-2">
          <SalesFormFieldRow label="Covers">
            <SalesNumericInput
              key={`${coversKey}-${form.id}-${form.sale_date}`}
              value={form[coversKey]}
              disabled={!canEdit}
              isInteger
              onChange={(v) => onChange(coversKey, v)}
            />
          </SalesFormFieldRow>
          <SalesFormFieldRow label="Walk-in Covers">
            <SalesNumericInput
              key={`${walkinCoversKey}-${form.id}-${form.sale_date}`}
              value={form[walkinCoversKey]}
              disabled={!canEdit}
              isInteger
              onChange={(v) => onChange(walkinCoversKey, v)}
            />
          </SalesFormFieldRow>
          <SalesFormFieldRow label="Bookings">
            <SalesNumericInput
              key={`${bookingsKey}-${form.id}-${form.sale_date}`}
              value={form[bookingsKey]}
              disabled={!canEdit}
              isInteger
              onChange={(v) => onChange(bookingsKey, v)}
            />
          </SalesFormFieldRow>
          <SalesFormFieldRow label="Walk-in Tables">
            <SalesNumericInput
              key={`${walkinTablesKey}-${form.id}-${form.sale_date}`}
              value={form[walkinTablesKey]}
              disabled={!canEdit}
              isInteger
              onChange={(v) => onChange(walkinTablesKey, v)}
            />
          </SalesFormFieldRow>
        </div>
      </div>
    </div>
  );
}

function DailyDiscountBox({
  value,
  totalTaxPct,
  canEdit,
  inputMode,
  onInputModeChange,
  onChange,
}: {
  value: number;
  totalTaxPct: number;
  canEdit: boolean;
  inputMode: SalesInputMode;
  onInputModeChange: (mode: SalesInputMode) => void;
  onChange: (value: string) => void;
}) {
  const displayValue =
    inputMode === "gross"
      ? value
      : Math.round(grossToNet(value, totalTaxPct) * 100) / 100;

  function handleChange(raw: string) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      onChange("0");
      return;
    }
    const gross =
      inputMode === "gross"
        ? parsed
        : Math.round(netToGross(parsed, totalTaxPct) * 100) / 100;
    onChange(String(gross));
  }

  return (
    <div
      className={salesFormColumnShellClass(
        "border-black/15 bg-[var(--venue-secondary,#F0F3DD)]",
      )}
    >
      <SalesFormSectionHeader
        title={
          <span className="whitespace-nowrap">Total Discounts</span>
        }
        action={
          <InputModeToggle
            mode={inputMode}
            onChange={onInputModeChange}
            disabled={!canEdit}
          />
        }
      />
      <div className="rounded-lg border border-black/10 bg-white px-4 py-3 text-center">
        <div className="mx-auto max-w-[12rem]">
          <SalesNumericInput
            key={`discount-${inputMode}`}
            value={displayValue}
            disabled={!canEdit}
            onChange={handleChange}
          />
        </div>
      </div>
    </div>
  );
}

function DailyTotalsColumn({
  totals,
  lunchCovers,
  lunchBookings,
  lunchWalkinTables,
  lunchWalkinCovers,
  dinnerCovers,
  dinnerBookings,
  dinnerWalkinTables,
  dinnerWalkinCovers,
}: {
  totals: ReturnType<typeof computeDailySales>;
  lunchCovers: number;
  lunchBookings: number;
  lunchWalkinTables: number;
  lunchWalkinCovers: number;
  dinnerCovers: number;
  dinnerBookings: number;
  dinnerWalkinTables: number;
  dinnerWalkinCovers: number;
}) {
  return (
    <div
      className={salesFormColumnClassName(
        "border-black/15 bg-[var(--venue-secondary,#F0F3DD)]",
      )}
    >
      <h3 className="whitespace-nowrap font-serif text-lg font-bold text-[#3D421F]">
        Total Revenue
      </h3>
      <div className="flex flex-1 flex-col space-y-2">
        <TotalCell
          label="Lunch Revenue"
          gross={totals.lunchTotalGs}
          net={totals.lunchTotalNet}
          covers={lunchCovers}
          bookings={lunchBookings}
          walkinTables={lunchWalkinTables}
          walkinCovers={lunchWalkinCovers}
        />
        <TotalCell
          label="Dinner Revenue"
          gross={totals.dinnerTotalGs}
          net={totals.dinnerTotalNet}
          covers={dinnerCovers}
          bookings={dinnerBookings}
          walkinTables={dinnerWalkinTables}
          walkinCovers={dinnerWalkinCovers}
        />
        <TotalCell
          label="Total Revenue (Excluding Graduity)"
          gross={totals.totalVenueGs}
          net={totals.totalVenueNet}
          covers={totals.totalCovers}
          bookings={totals.totalBookings}
          walkinTables={totals.totalWalkinTables}
          walkinCovers={totals.totalWalkinCovers}
        />
      </div>
    </div>
  );
}

function TotalCell({
  label,
  gross,
  net,
  covers,
  bookings,
  walkinTables,
  walkinCovers,
}: {
  label: string;
  gross: number;
  net: number;
  covers: number;
  bookings: number;
  walkinTables: number;
  walkinCovers: number;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center rounded-lg border border-black/10 bg-white px-4 py-3 text-center">
      <p className="text-xs font-medium tracking-wide text-black/50">
        {label}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Gross
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-[#3D421F]">
            {formatMoney(gross)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Net
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-[#3D421F]">
            {formatMoney(net)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium tabular-nums text-black/60">
        {formatCount(covers)} covers · {formatCount(bookings)} bookings
      </p>
      <p className="mt-1 text-xs tabular-nums text-black/50">
        {formatCount(walkinTables)} walk-in tables · {formatCount(walkinCovers)}{" "}
        walk-in covers
      </p>
    </div>
  );
}

function TenderVerificationRow({
  label,
  waitersTotal,
  entered,
}: {
  label: string;
  waitersTotal: number;
  entered: number;
}) {
  const difference = Math.round((entered - waitersTotal) * 100) / 100;
  const balanced = difference === 0;
  return (
    <div
      className="grid flex-1 items-center gap-x-2 border-b border-black/5 py-1 text-[11px] last:border-0"
      style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
    >
      <span className="truncate text-black/70">{label}</span>
      <span className="w-16 text-right tabular-nums text-black/60">
        {formatMoney(waitersTotal)}
      </span>
      <span className="w-16 text-right tabular-nums text-black/60">
        {formatMoney(entered)}
      </span>
      <span
        className={cn(
          "w-16 text-right font-semibold tabular-nums",
          balanced ? "text-emerald-700" : "text-amber-700",
        )}
      >
        {balanced ? "—" : formatDifference(difference)}
      </span>
    </div>
  );
}

function DailyTenderTotalsColumn({
  tenders,
  amounts,
  totalTaxPct,
  canEdit,
  inputMode,
  onInputModeChange,
  onChange,
  discountValue,
  discountInputMode,
  onDiscountInputModeChange,
  onDiscountChange,
}: {
  tenders: VenueTender[];
  amounts: Record<string, number>;
  totalTaxPct: number;
  canEdit: boolean;
  inputMode: SalesInputMode;
  onInputModeChange: (mode: SalesInputMode) => void;
  onChange: (tenderId: string, value: string) => void;
  discountValue: number;
  discountInputMode: SalesInputMode;
  onDiscountInputModeChange: (mode: SalesInputMode) => void;
  onDiscountChange: (value: string) => void;
}) {
  function displayValue(gross: number): number {
    if (inputMode === "gross") return gross;
    return Math.round(grossToNet(gross, totalTaxPct) * 100) / 100;
  }

  function handleTenderChange(tenderId: string, raw: string) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      onChange(tenderId, "0");
      return;
    }
    const gross =
      inputMode === "gross"
        ? parsed
        : Math.round(netToGross(parsed, totalTaxPct) * 100) / 100;
    onChange(tenderId, String(gross));
  }

  const enteredTotalGross = useMemo(
    () =>
      Math.round(
        tenders.reduce((sum, t) => sum + (amounts[t.id] ?? 0), 0) * 100,
      ) / 100,
    [tenders, amounts],
  );
  const enteredTotalNet =
    Math.round(grossToNet(enteredTotalGross, totalTaxPct) * 100) / 100;

  return (
    <div
      className={cn(
        salesFormColumnWidthClass(),
        "flex flex-col gap-6 self-stretch",
      )}
    >
      <DailyDiscountBox
        value={discountValue}
        totalTaxPct={totalTaxPct}
        canEdit={canEdit}
        inputMode={discountInputMode}
        onInputModeChange={onDiscountInputModeChange}
        onChange={onDiscountChange}
      />

      <div
        className={salesFormColumnShellClass(
          "border-black/15 bg-[var(--venue-secondary,#F0F3DD)]",
        )}
      >
        <SalesFormSectionHeader
          title={
            <span className="whitespace-nowrap">Total Tenders</span>
          }
          action={
            tenders.length > 0 ? (
              <InputModeToggle
                mode={inputMode}
                onChange={onInputModeChange}
                disabled={!canEdit}
              />
            ) : undefined
          }
        />
        {tenders.length === 0 ? (
          <p className="text-sm text-black/50">
            No active tenders.{" "}
            <Link
              href="/sales/settings/tenders"
              className="font-medium text-[var(--venue-primary)] underline-offset-2 hover:underline"
            >
              Configure tenders
            </Link>
          </p>
        ) : (
          <div className="flex flex-1 flex-col space-y-2">
            {tenders.map((tender) => (
              <SalesFormFieldRow key={tender.id} label={tender.name}>
                <SalesNumericInput
                  key={`${tender.id}-${inputMode}`}
                  value={displayValue(amounts[tender.id] ?? 0)}
                  disabled={!canEdit}
                  onChange={(v) => handleTenderChange(tender.id, v)}
                />
              </SalesFormFieldRow>
            ))}
            <div className="flex flex-col gap-1 rounded-lg border border-black/10 bg-white px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-black/50">
                Total
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                  Gross
                </span>
                <span className="text-base font-bold tabular-nums text-[#3D421F]">
                  {formatMoney(enteredTotalGross)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                  Net
                </span>
                <span className="text-base font-bold tabular-nums text-[#3D421F]">
                  {formatMoney(enteredTotalNet)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TenderVerificationColumn({
  tenders,
  amounts,
  waiterSums,
  gratuityCc,
  venueRevenueGross,
}: {
  tenders: VenueTender[];
  amounts: Record<string, number>;
  waiterSums: Record<string, number>;
  gratuityCc: number;
  venueRevenueGross: number;
}) {
  const enteredTotalGross = useMemo(
    () =>
      Math.round(
        tenders.reduce((sum, t) => sum + (amounts[t.id] ?? 0), 0) * 100,
      ) / 100,
    [tenders, amounts],
  );
  const waitersTotalGross = useMemo(
    () =>
      Math.round(
        tenders.reduce((sum, t) => sum + (waiterSums[t.id] ?? 0), 0) * 100,
      ) / 100,
    [tenders, waiterSums],
  );
  const overallDifference =
    Math.round((enteredTotalGross - waitersTotalGross) * 100) / 100;
  const overallBalanced = Math.abs(overallDifference) <= ROUNDING_TOLERANCE;

  const waitersExGratuity =
    Math.round((waitersTotalGross - gratuityCc) * 100) / 100;
  const enteredExGratuity =
    Math.round((enteredTotalGross - gratuityCc) * 100) / 100;
  const exGratuityDifference =
    Math.round((enteredExGratuity - waitersExGratuity) * 100) / 100;
  const exGratuityBalanced =
    Math.abs(exGratuityDifference) <= ROUNDING_TOLERANCE;

  const salesVsRevenueDiff =
    Math.round((waitersExGratuity - venueRevenueGross) * 100) / 100;
  const salesVsRevenueBalanced =
    Math.abs(salesVsRevenueDiff) <= ROUNDING_TOLERANCE;

  if (tenders.length === 0) return null;

  return (
    <div className={salesFormColumnClassName("bg-white/80")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-[#3D421F]">
          Tender Verification
        </h3>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
            overallBalanced
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800",
          )}
        >
          {overallBalanced ? "Balanced" : "Difference found"}
        </span>
      </div>
      <p className="text-xs text-black/50">
        Sum of each tender across all waiter entries vs the daily total entered
        in Total Tenders.
      </p>
      <div className="mt-1 flex flex-1 flex-col">
        <div
          className="grid items-center gap-x-2 border-b border-black/10 pb-1 text-[10px] font-medium uppercase tracking-wide text-black/45"
          style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
        >
          <span>Tender</span>
          <span className="w-16 text-right">Waiters</span>
          <span className="w-16 text-right">Daily</span>
          <span className="w-16 text-right">Δ</span>
        </div>
        <div className="flex flex-1 flex-col">
          {tenders.map((tender) => (
            <TenderVerificationRow
              key={tender.id}
              label={tender.name}
              waitersTotal={waiterSums[tender.id] ?? 0}
              entered={amounts[tender.id] ?? 0}
            />
          ))}
        </div>
        <div
          className="mt-1 grid items-center gap-x-2 rounded-md border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/70 px-2 py-1.5 text-[11px] font-bold"
          style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
        >
          <span className="text-[#3D421F]">Payment Total</span>
          <span className="w-16 text-right tabular-nums text-[#3D421F]">
            {formatMoney(waitersTotalGross)}
          </span>
          <span className="w-16 text-right tabular-nums text-[#3D421F]">
            {formatMoney(enteredTotalGross)}
          </span>
          <span
            className={cn(
              "w-16 text-right tabular-nums",
              overallBalanced ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {overallDifference === 0 ? "—" : formatDifference(overallDifference)}
          </span>
        </div>
        <div
          className="mt-1 grid items-center gap-x-2 px-2 py-1 text-[11px]"
          style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
        >
          <span className="truncate text-black/60">CC Gratuity</span>
          <span className="w-16 text-right tabular-nums text-black/60">
            {formatMoney(gratuityCc)}
          </span>
          <span className="w-16 text-right tabular-nums text-black/40">—</span>
          <span className="w-16 text-right tabular-nums text-black/40">—</span>
        </div>
        <div
          className="mt-1 grid items-center gap-x-2 border-t-2 border-black/25 px-2 pt-1.5 text-[11px] font-semibold"
          style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
        >
          <span className="truncate text-black/70">Sales Total</span>
          <span className="w-16 text-right tabular-nums text-black/70">
            {formatMoney(waitersExGratuity)}
          </span>
          <span className="w-16 text-right tabular-nums text-black/70">
            {formatMoney(enteredExGratuity)}
          </span>
          <span
            className={cn(
              "w-16 text-right tabular-nums",
              exGratuityBalanced ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {exGratuityDifference === 0
              ? "—"
              : formatDifference(exGratuityDifference)}
          </span>
        </div>
        <div
          className={cn(
            "mt-4 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px]",
            salesVsRevenueBalanced
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          <span className="flex-1 text-center font-medium leading-tight">
            Sales Total VS
            <br />
            Total Revenue Exc. CC Gratuity
          </span>
          <span className="tabular-nums font-semibold uppercase">
            {salesVsRevenueDiff === 0
              ? "Matched"
              : formatDifference(salesVsRevenueDiff)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TaxCollectionEntryRow({
  label,
  hint,
  expected,
  entered,
  canEdit,
  inputKey,
  onChange,
}: {
  label: string;
  hint?: string;
  expected: number;
  entered: number;
  canEdit: boolean;
  inputKey: string;
  onChange: (value: string) => void;
}) {
  const difference = Math.round((entered - expected) * 100) / 100;
  const matched = Math.abs(difference) <= ROUNDING_TOLERANCE;
  return (
    <div className="space-y-1.5 border-b border-black/5 pb-2.5 last:border-0">
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] font-medium text-black/70">{label}</span>
        {hint ? (
          <span className="text-[10px] text-black/40">{hint}</span>
        ) : null}
      </div>
      <SalesNumericInput
        key={inputKey}
        value={entered}
        disabled={!canEdit}
        onChange={onChange}
      />
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="text-black/45">
          Expected {formatMoney(expected)}
        </span>
        <span
          className={cn(
            "font-semibold uppercase tabular-nums",
            matched ? "text-emerald-700" : "text-amber-700",
          )}
        >
          {difference === 0 ? "Matched" : formatDifference(difference)}
        </span>
      </div>
    </div>
  );
}

function TaxCollectionColumn({
  taxSettings,
  totalTaxPct,
  venueRevenueGross,
  vatEntered,
  municipalityEntered,
  serviceChargeEntered,
  canEdit,
  formKey,
  onChange,
}: {
  taxSettings: VenueSalesTaxSettings;
  totalTaxPct: number;
  venueRevenueGross: number;
  vatEntered: number;
  municipalityEntered: number;
  serviceChargeEntered: number;
  canEdit: boolean;
  formKey: string;
  onChange: (field: VenueDailySalesInputField, value: string) => void;
}) {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const netSalesRaw = grossToNet(venueRevenueGross, totalTaxPct);
  const vatOnServiceEffectivePct =
    taxSettings.service_charge_pct *
    (taxSettings.vat_on_service_charge_pct / 100);

  const serviceChargeExpected = round2(
    netSalesRaw * (taxSettings.service_charge_pct / 100),
  );
  const municipalityExpected = round2(
    netSalesRaw * (taxSettings.municipality_fee_pct / 100),
  );
  const vatExpected = round2(
    netSalesRaw * ((taxSettings.vat_pct + vatOnServiceEffectivePct) / 100),
  );

  const netSales = round2(netSalesRaw);
  const expectedTotal = round2(
    vatExpected + municipalityExpected + serviceChargeExpected,
  );
  const enteredTotal = round2(
    vatEntered + municipalityEntered + serviceChargeEntered,
  );
  const totalDifference = round2(enteredTotal - expectedTotal);
  const totalMatched = Math.abs(totalDifference) <= ROUNDING_TOLERANCE;

  const netPlusEntered = round2(netSales + enteredTotal);
  const grossDifference = round2(netPlusEntered - round2(venueRevenueGross));
  const grossMatched = Math.abs(grossDifference) <= ROUNDING_TOLERANCE;

  return (
    <div className={salesFormColumnClassName("bg-white/80")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-[#3D421F]">
          Tax Collection
        </h3>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
            totalMatched
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800",
          )}
        >
          {totalMatched ? "Balanced" : "Difference found"}
        </span>
      </div>
      <p className="text-xs text-black/50">
        Enter the tax collected for the day. Expected values are computed from
        Total Revenue (excl. gratuity) and the venue tax settings.
      </p>

      <div className="mt-1 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/20 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
          Net Sales
        </p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-[#3D421F]">
          {formatMoney(netSales)}
        </p>
        <p className="mt-0.5 text-[10px] text-black/45">
          Total Revenue ÷ (1 + {formatPct(totalTaxPct)}%)
        </p>
      </div>

      <div className="mt-1 flex flex-1 flex-col gap-2.5">
        <TaxCollectionEntryRow
          label={`VAT (${formatPct(taxSettings.vat_pct)}%)`}
          hint={
            vatOnServiceEffectivePct > 0
              ? `incl. ${formatPct(vatOnServiceEffectivePct)}% VAT on service charge`
              : undefined
          }
          expected={vatExpected}
          entered={vatEntered}
          canEdit={canEdit}
          inputKey={`vat-${formKey}`}
          onChange={(v) => onChange("vat_collected_gs", v)}
        />
        <TaxCollectionEntryRow
          label={`Municipality Fees (${formatPct(taxSettings.municipality_fee_pct)}%)`}
          expected={municipalityExpected}
          entered={municipalityEntered}
          canEdit={canEdit}
          inputKey={`municipality-${formKey}`}
          onChange={(v) => onChange("municipality_fee_collected_gs", v)}
        />
        <TaxCollectionEntryRow
          label={`Service Charge (${formatPct(taxSettings.service_charge_pct)}%)`}
          expected={serviceChargeExpected}
          entered={serviceChargeEntered}
          canEdit={canEdit}
          inputKey={`service-charge-${formKey}`}
          onChange={(v) => onChange("service_charge_collected_gs", v)}
        />
      </div>

      <div
        className="mt-1 grid items-center gap-x-2 rounded-md border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/70 px-2 py-1.5 text-[11px] font-bold"
        style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}
      >
        <span className="text-[#3D421F]">Total Tax Collected</span>
        <span className="w-20 text-right tabular-nums text-[#3D421F]">
          {formatMoney(enteredTotal)}
        </span>
        <span
          className={cn(
            "w-16 text-right tabular-nums",
            totalMatched ? "text-emerald-700" : "text-amber-700",
          )}
        >
          {totalDifference === 0 ? "—" : formatDifference(totalDifference)}
        </span>
      </div>
      <p className="px-2 text-[10px] text-black/40">
        Expected total {formatMoney(expectedTotal)}
      </p>

      <div
        className={cn(
          "mt-3 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px]",
          grossMatched
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800",
        )}
      >
        <span className="flex-1 text-center font-medium leading-tight">
          Net + Entered Tax VS
          <br />
          Total Revenue (excl. gratuity)
        </span>
        <span className="tabular-nums font-semibold uppercase">
          {grossDifference === 0 ? "Matched" : formatDifference(grossDifference)}
        </span>
      </div>
    </div>
  );
}

export function DailySalesEntryForm({
  records,
  tenders,
  waiterRecords,
  tenderTotals,
  totalTaxPct,
  taxSettings,
  canEdit,
}: DailySalesEntryFormProps) {
  const today = formatLocalDate(new Date());
  const tenderIds = useMemo(() => tenders.map((t) => t.id), [tenders]);
  const recordsByDate = useMemo(
    () => new Map(records.map((r) => [r.sale_date, r])),
    [records],
  );
  const datesWithEntries = useMemo(
    () => new Set(recordsByDate.keys()),
    [recordsByDate],
  );

  const tenderTotalsByDate = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const row of tenderTotals) {
      const current = map.get(row.sale_date) ?? {};
      current[row.tender_id] = Number(row.amount_gs);
      map.set(row.sale_date, current);
    }
    return map;
  }, [tenderTotals]);

  const waiterTenderSumsByDate = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const record of waiterRecords) {
      const current = map.get(record.sale_date) ?? {};
      for (const [tenderId, amount] of Object.entries(
        record.tender_amounts ?? {},
      )) {
        current[tenderId] = (current[tenderId] ?? 0) + Number(amount);
      }
      map.set(record.sale_date, current);
    }
    for (const [date, sums] of map) {
      for (const key of Object.keys(sums)) {
        sums[key] = Math.round(sums[key] * 100) / 100;
      }
      map.set(date, sums);
    }
    return map;
  }, [waiterRecords]);

  const [selectedDate, setSelectedDate] = useState(today);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(today, tenderIds),
  );
  const [lunchInputMode, setLunchInputMode] = useState<SalesInputMode>("gross");
  const [dinnerInputMode, setDinnerInputMode] = useState<SalesInputMode>("gross");
  const [tenderInputMode, setTenderInputMode] = useState<SalesInputMode>("gross");
  const [discountInputMode, setDiscountInputMode] =
    useState<SalesInputMode>("gross");
  const [isPending, startTransition] = useTransition();

  const isExisting = recordsByDate.has(selectedDate);
  const fieldsEditable = canEdit && isFormOpen;

  const totals = useMemo(() => {
    const asRecord: VenueDailySalesRecord = {
      ...form,
      venue_id: "",
      created_by: null,
      updated_by: null,
      created_at: "",
      updated_at: "",
    };
    return computeDailySales(asRecord, totalTaxPct);
  }, [form, totalTaxPct]);

  const saveFormRef = useRef<() => Promise<boolean>>(async () => false);
  const { syncBaseline, guardAction, unsavedDialog } = useSalesFormUnsavedGuard({
    isEditing: isFormOpen,
    state: form,
    onSaveRef: saveFormRef,
  });

  saveFormRef.current = async () => {
    const formData = new FormData();
    if (form.id) formData.set("id", form.id);
    formData.set("sale_date", selectedDate);
    (
      [
        "lunch_food_gs",
        "lunch_beverages_gs",
        "lunch_wine_gs",
        "lunch_shisha_gs",
        "lunch_tobacco_gs",
        "lunch_others_gs",
        "lunch_service_fees_gs",
        "lunch_covers",
        "lunch_bookings",
        "lunch_walkin_tables",
        "lunch_walkin_covers",
        "dinner_food_gs",
        "dinner_beverages_gs",
        "dinner_wine_gs",
        "dinner_shisha_gs",
        "dinner_tobacco_gs",
        "dinner_others_gs",
        "dinner_service_fees_gs",
        "dinner_covers",
        "dinner_bookings",
        "dinner_walkin_tables",
        "dinner_walkin_covers",
        "all_day_discount_gs",
        "vat_collected_gs",
        "municipality_fee_collected_gs",
        "service_charge_collected_gs",
      ] as VenueDailySalesInputField[]
    ).forEach((field) => formData.set(field, String(form[field])));

    const result = await saveVenueDailySalesEntry(formData);
    if (result.error) {
      toast.error(result.error);
      return false;
    }

    if (tenderIds.length > 0) {
      const tenderData = new FormData();
      tenderData.set("sale_date", selectedDate);
      for (const [tenderId, amount] of Object.entries(form.tender_totals)) {
        tenderData.set(`tender_${tenderId}`, String(amount));
      }
      const tenderResult = await saveVenueDailyTenderTotals(tenderData);
      if (tenderResult.error) {
        toast.error(tenderResult.error);
        return false;
      }
    }

    const updated = result.record
      ? recordToForm(result.record, form.tender_totals)
      : form;
    setForm(updated);
    syncBaseline(updated);
    toast.saved(result.success ?? "Saved to cloud.");
    return true;
  };

  function formForDate(date: string): FormState {
    const existing = recordsByDate.get(date);
    const tenderTotalsForDate = {
      ...emptyTenderTotals(tenderIds),
      ...(tenderTotalsByDate.get(date) ?? {}),
    };
    return existing
      ? recordToForm(existing, tenderTotalsForDate)
      : { ...emptyForm(date, tenderIds), tender_totals: tenderTotalsForDate };
  }

  useEffect(() => {
    if (isFormOpen) return;
    const next = formForDate(selectedDate);
    setForm(next);
    syncBaseline(next);
  }, [
    selectedDate,
    recordsByDate,
    tenderTotalsByDate,
    tenderIds,
    isFormOpen,
    syncBaseline,
  ]);

  function handleDateChange(date: string) {
    guardAction(() => {
      setSelectedDate(date);
      setIsFormOpen(false);
    });
  }

  function openForm() {
    if (!canCreateSalesEntryForDate(selectedDate, isExisting)) {
      toast.alert(FUTURE_SALES_ENTRY_ERROR);
      return;
    }
    const initial = formForDate(selectedDate);
    setForm(initial);
    syncBaseline(initial);
    setIsFormOpen(true);
  }

  function updateField(field: VenueDailySalesInputField, value: string) {
    const isCount =
      field.endsWith("_covers") ||
      field.endsWith("_bookings") ||
      field.endsWith("_walkin_tables") ||
      field.endsWith("_walkin_covers");
    const parsed = isCount
      ? Number.parseInt(value, 10)
      : Number.parseFloat(value);

    setForm((prev) => ({
      ...prev,
      [field]:
        !Number.isFinite(parsed) || parsed < 0
          ? 0
          : isCount
            ? parsed
            : Math.round(parsed * 100) / 100,
    }));
  }

  function updateTenderTotal(tenderId: string, value: string) {
    const parsed = Number.parseFloat(value);
    setForm((prev) => ({
      ...prev,
      tender_totals: {
        ...prev.tender_totals,
        [tenderId]:
          !Number.isFinite(parsed) || parsed < 0
            ? 0
            : Math.round(parsed * 100) / 100,
      },
    }));
  }

  const waiterSumsForDate = waiterTenderSumsByDate.get(selectedDate) ?? {};
  const gratuityCcForDate = useMemo(() => {
    let sum = 0;
    for (const record of waiterRecords) {
      if (record.sale_date !== selectedDate) continue;
      sum += Number(record.gratuity_cc_gs);
    }
    return Math.round(sum * 100) / 100;
  }, [waiterRecords, selectedDate]);

  function handleSave() {
    startTransition(() => {
      void saveFormRef.current();
    });
  }

  return (
    <div className="space-y-6">
      {unsavedDialog}
      <SalesEntryDateBar
        selectedDate={selectedDate}
        canEdit={canEdit}
        onDateChange={handleDateChange}
        isFormOpen={isFormOpen}
        isExisting={isExisting}
        isPending={isPending}
        onOpenForm={openForm}
        onSave={handleSave}
        datesWithEntries={datesWithEntries}
      />

      <div className="space-y-3 text-center">
        {isFormOpen ? (
          <p className="text-sm text-black/60">
            Enter sales figures as{" "}
            <span className="font-medium text-[#3D421F]">Gross</span> or{" "}
            <span className="font-medium text-[#3D421F]">Net</span> using the
            toggle on each service period. Values are saved as gross sales;
            combined tax rate {formatPct(totalTaxPct)}% is applied for net
            conversions.
          </p>
        ) : isFutureSalesEntryDate(selectedDate) && !isExisting ? (
          <p className="text-sm text-black/50">{FUTURE_SALES_ENTRY_ERROR}</p>
        ) : canEdit ? (
          <p className="text-sm text-black/50">
            Viewing {isExisting ? "saved entry" : "empty day"} for this date. Click{" "}
            {isExisting ? "Edit entry" : "Create entry"} to make changes.
          </p>
        ) : (
          <p className="text-sm text-black/50">
            You have view-only access for daily sales entry.
          </p>
        )}

        <SalesFormColumnsLayout>
          <div
            className={cn(
              salesFormColumnShellClass(),
              salesFormColumnWidthClass(),
              "items-center justify-center py-3 text-center text-sm font-medium tabular-nums text-[#3D421F] shadow-sm",
            )}
          >
            <SalesEntryDateBanner dateStr={selectedDate} />
          </div>
        </SalesFormColumnsLayout>
      </div>

      <SalesFormColumnsLayout>
        <ServiceColumn
          title="Lunch Sales"
          salesFields={LUNCH_SALES_FIELDS}
          coversKey="lunch_covers"
          bookingsKey="lunch_bookings"
          walkinTablesKey="lunch_walkin_tables"
          walkinCoversKey="lunch_walkin_covers"
          form={form}
          canEdit={fieldsEditable}
          inputMode={lunchInputMode}
          totalTaxPct={totalTaxPct}
          onInputModeChange={setLunchInputMode}
          onChange={updateField}
        />
        <ServiceColumn
          title="Dinner Sales"
          salesFields={DINNER_SALES_FIELDS}
          coversKey="dinner_covers"
          bookingsKey="dinner_bookings"
          walkinTablesKey="dinner_walkin_tables"
          walkinCoversKey="dinner_walkin_covers"
          form={form}
          canEdit={fieldsEditable}
          inputMode={dinnerInputMode}
          totalTaxPct={totalTaxPct}
          onInputModeChange={setDinnerInputMode}
          onChange={updateField}
        />
        <DailyTenderTotalsColumn
          tenders={tenders}
          amounts={form.tender_totals}
          totalTaxPct={totalTaxPct}
          canEdit={fieldsEditable}
          inputMode={tenderInputMode}
          onInputModeChange={setTenderInputMode}
          onChange={updateTenderTotal}
          discountValue={form.all_day_discount_gs}
          discountInputMode={discountInputMode}
          onDiscountInputModeChange={setDiscountInputMode}
          onDiscountChange={(v) => updateField("all_day_discount_gs", v)}
        />
        <DailyTotalsColumn
          totals={totals}
          lunchCovers={form.lunch_covers}
          lunchBookings={form.lunch_bookings}
          lunchWalkinTables={form.lunch_walkin_tables}
          lunchWalkinCovers={form.lunch_walkin_covers}
          dinnerCovers={form.dinner_covers}
          dinnerBookings={form.dinner_bookings}
          dinnerWalkinTables={form.dinner_walkin_tables}
          dinnerWalkinCovers={form.dinner_walkin_covers}
        />
        <TenderVerificationColumn
          tenders={tenders}
          amounts={form.tender_totals}
          waiterSums={waiterSumsForDate}
          gratuityCc={gratuityCcForDate}
          venueRevenueGross={totals.totalVenueGs}
        />
        <TaxCollectionColumn
          taxSettings={taxSettings}
          totalTaxPct={totalTaxPct}
          venueRevenueGross={totals.totalVenueGs}
          vatEntered={form.vat_collected_gs}
          municipalityEntered={form.municipality_fee_collected_gs}
          serviceChargeEntered={form.service_charge_collected_gs}
          canEdit={fieldsEditable}
          formKey={`${form.id}-${form.sale_date}`}
          onChange={updateField}
        />
      </SalesFormColumnsLayout>
    </div>
  );
}
