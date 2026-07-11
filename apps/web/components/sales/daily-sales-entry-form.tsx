"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveVenueDailySalesEntry } from "@/lib/actions/sales";
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
} from "@/lib/sales/daily-sales-types";
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
import { cn } from "@/lib/utils";

type DailySalesEntryFormProps = {
  records: VenueDailySalesRecord[];
  totalTaxPct: number;
  canEdit: boolean;
};

type SalesInputMode = "gross" | "net";

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

function emptyForm(date: string): FormState {
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
  };
}

function recordToForm(record: VenueDailySalesRecord): FormState {
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
  };
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
          <SalesFormFieldRow label="Walk-in Covers">
            <SalesNumericInput
              key={`${walkinCoversKey}-${form.id}-${form.sale_date}`}
              value={form[walkinCoversKey]}
              disabled={!canEdit}
              isInteger
              onChange={(v) => onChange(walkinCoversKey, v)}
            />
          </SalesFormFieldRow>
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
      <SalesFormSectionHeader title="Daily Total Revenue" />
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
    <div className="rounded-lg border border-black/10 bg-white px-4 py-3 text-center">
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

export function DailySalesEntryForm({
  records,
  totalTaxPct,
  canEdit,
}: DailySalesEntryFormProps) {
  const today = formatLocalDate(new Date());
  const recordsByDate = useMemo(
    () => new Map(records.map((r) => [r.sale_date, r])),
    [records],
  );

  const [selectedDate, setSelectedDate] = useState(today);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [lunchInputMode, setLunchInputMode] = useState<SalesInputMode>("gross");
  const [dinnerInputMode, setDinnerInputMode] = useState<SalesInputMode>("gross");
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage(null);

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
      ] as VenueDailySalesInputField[]
    ).forEach((field) => formData.set(field, String(form[field])));

    const result = await saveVenueDailySalesEntry(formData);
    if (result.error) {
      setMessage(result.error);
      return false;
    }

    const updated = result.record ? recordToForm(result.record) : form;
    setForm(updated);
    syncBaseline(updated);
    setMessage(result.success ?? "Saved to cloud.");
    return true;
  };

  function formForDate(date: string): FormState {
    const existing = recordsByDate.get(date);
    return existing ? recordToForm(existing) : emptyForm(date);
  }

  useEffect(() => {
    if (isFormOpen) return;
    const next = formForDate(selectedDate);
    setForm(next);
    syncBaseline(next);
  }, [selectedDate, recordsByDate, isFormOpen, syncBaseline]);

  function handleDateChange(date: string) {
    guardAction(() => {
      setSelectedDate(date);
      setIsFormOpen(false);
      setMessage(null);
    });
  }

  function openForm() {
    if (!canCreateSalesEntryForDate(selectedDate, isExisting)) {
      setMessage(FUTURE_SALES_ENTRY_ERROR);
      return;
    }
    const initial = formForDate(selectedDate);
    setForm(initial);
    syncBaseline(initial);
    setIsFormOpen(true);
    setMessage(null);
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

      {message ? (
        <p className="text-center text-sm text-black/60">{message}</p>
      ) : null}

      <SalesFormColumnsLayout>
        <ServiceColumn
          title="Lunch"
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
          title="Dinner"
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
      </SalesFormColumnsLayout>
    </div>
  );
}
