"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { saveVenueDailyDiscountsEntry } from "@/lib/actions/sales";
import {
  canCreateSalesEntryForDate,
  FUTURE_SALES_ENTRY_ERROR,
  isFutureSalesEntryDate,
} from "@/lib/sales/sales-entry-dates";
import {
  formatMoney,
  formatPct,
  grossToNet,
  netToGross,
} from "@/lib/sales/daily-sales-calculations";
import { computeDailyDiscounts } from "@/lib/sales/discounts-calculations";
import type {
  VenueDailyDiscountsInputField,
  VenueDailyDiscountsRecord,
} from "@/lib/sales/discounts-types";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
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

type DiscountsEntryFormProps = {
  records: VenueDailyDiscountsRecord[];
  dailySalesRecords: VenueDailySalesRecord[];
  totalTaxPct: number;
  canEdit: boolean;
};

type DiscountsInputMode = "gross" | "net";

type FormState = {
  id: string;
  sale_date: string;
  food_discount_gs: number;
  beverages_discount_gs: number;
  wine_discount_gs: number;
  shisha_discount_gs: number;
  others_discount_gs: number;
};

const DISCOUNT_FIELDS: { key: VenueDailyDiscountsInputField; label: string }[] = [
  { key: "food_discount_gs", label: "Food Discounts" },
  { key: "beverages_discount_gs", label: "Beverages Discounts" },
  { key: "wine_discount_gs", label: "Wine Discounts" },
  { key: "shisha_discount_gs", label: "Shisha Discounts" },
  { key: "others_discount_gs", label: "Other Discounts" },
];

const SAVE_FIELDS: VenueDailyDiscountsInputField[] = DISCOUNT_FIELDS.map(
  (f) => f.key,
);

function emptyForm(date: string): FormState {
  return {
    id: "",
    sale_date: date,
    food_discount_gs: 0,
    beverages_discount_gs: 0,
    wine_discount_gs: 0,
    shisha_discount_gs: 0,
    others_discount_gs: 0,
  };
}

function recordToForm(record: VenueDailyDiscountsRecord): FormState {
  return { ...record };
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
  mode: DiscountsInputMode;
  onChange: (mode: DiscountsInputMode) => void;
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
  fields,
  form,
  canEdit,
  inputMode,
  totalTaxPct,
  onInputModeChange,
  onChange,
}: {
  title: string;
  fields: { key: VenueDailyDiscountsInputField; label: string }[];
  form: FormState;
  canEdit: boolean;
  inputMode: DiscountsInputMode;
  totalTaxPct: number;
  onInputModeChange: (mode: DiscountsInputMode) => void;
  onChange: (field: VenueDailyDiscountsInputField, value: string) => void;
}) {
  function displayValue(gross: number): number {
    if (inputMode === "gross") return gross;
    return Math.round(grossToNet(gross, totalTaxPct) * 100) / 100;
  }

  function handleDiscountChange(
    field: VenueDailyDiscountsInputField,
    raw: string,
  ) {
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
      <div className="space-y-2">
        {fields.map((field) => (
          <SalesFormFieldRow key={field.key} label={field.label}>
            <SalesNumericInput
              key={`${field.key}-${form.id}-${form.sale_date}-${inputMode}`}
              value={displayValue(form[field.key])}
              disabled={!canEdit}
              onChange={(v) => handleDiscountChange(field.key, v)}
            />
          </SalesFormFieldRow>
        ))}
      </div>
    </div>
  );
}

function CategoryTotalCell({
  label,
  gross,
  net,
}: {
  label: string;
  gross: number;
  net: number;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center rounded-lg border border-black/10 bg-white px-4 py-2 text-center">
      <p className="text-xs font-medium tracking-wide text-black/50">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Gross
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-[#3D421F]">
            {formatMoney(gross)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Net
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-[#3D421F]">
            {formatMoney(net)}
          </p>
        </div>
      </div>
    </div>
  );
}

function DiscountsTotalsColumn({
  totals,
}: {
  totals: ReturnType<typeof computeDailyDiscounts>;
}) {
  return (
    <div
      className={salesFormColumnClassName(
        "border-black/15 bg-[var(--venue-secondary,#F0F3DD)]",
      )}
    >
      <SalesFormSectionHeader title="Totals" />
      <div className="flex flex-1 flex-col space-y-2">
        <CategoryTotalCell
          label="Food"
          gross={totals.totalFoodDiscountGs}
          net={totals.totalFoodDiscountNet}
        />
        <CategoryTotalCell
          label="Beverages"
          gross={totals.totalBeveragesDiscountGs}
          net={totals.totalBeveragesDiscountNet}
        />
        <CategoryTotalCell
          label="Wine"
          gross={totals.totalWineDiscountGs}
          net={totals.totalWineDiscountNet}
        />
        <CategoryTotalCell
          label="Shisha"
          gross={totals.totalShishaDiscountGs}
          net={totals.totalShishaDiscountNet}
        />
        <CategoryTotalCell
          label="Other"
          gross={totals.totalOthersDiscountGs}
          net={totals.totalOthersDiscountNet}
        />
      </div>
    </div>
  );
}

function ValidationRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-white px-3 py-1.5">
      <span className="text-[11px] font-medium tracking-wide text-black/50">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums text-[#3D421F]">
        {formatMoney(value)}
      </span>
    </div>
  );
}

function DiscountsValidationColumn({
  discountsTotalGs,
  allDayDiscountGs,
}: {
  discountsTotalGs: number;
  allDayDiscountGs: number;
}) {
  const diff = Math.round((discountsTotalGs - allDayDiscountGs) * 100) / 100;
  const hasData = discountsTotalGs > 0 || allDayDiscountGs > 0;
  const matches = Math.abs(diff) < 0.005;

  return (
    <div
      className={salesFormColumnShellClass(
        "gap-2 border-black/15 bg-[var(--venue-secondary,#F0F3DD)]",
      )}
    >
      <h3 className="font-serif text-lg font-bold text-[#3D421F]">Validation</h3>
      <ValidationRow label="Discounts entry (this page)" value={discountsTotalGs} />
      <ValidationRow
        label="All day Discounts (Daily Sales)"
        value={allDayDiscountGs}
      />
      <div
        className={cn(
          "rounded-md border px-3 py-1.5 text-center",
          !hasData
            ? "border-black/10 bg-white"
            : matches
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50",
        )}
      >
        {!hasData ? (
          <p className="text-xs font-medium text-black/45">
            No discounts entered for this date
          </p>
        ) : matches ? (
          <p className="text-sm font-bold text-emerald-700">
            Matched — both entries agree
          </p>
        ) : (
          <p className="text-sm font-bold text-amber-700">
            Difference {formatMoney(diff)}
            <span className="ml-1 font-medium text-amber-700/80">
              (
              {diff > 0
                ? "Discounts entry higher"
                : "Daily Sales higher"}
              )
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

export function DiscountsEntryForm({
  records,
  dailySalesRecords,
  totalTaxPct,
  canEdit,
}: DiscountsEntryFormProps) {
  const today = formatLocalDate(new Date());
  const searchParams = useSearchParams();
  const recordsByDate = useMemo(
    () => new Map(records.map((r) => [r.sale_date, r])),
    [records],
  );
  const datesWithEntries = useMemo(
    () => new Set(recordsByDate.keys()),
    [recordsByDate],
  );
  const allDayDiscountByDate = useMemo(
    () =>
      new Map(
        dailySalesRecords.map((r) => [r.sale_date, r.all_day_discount_gs ?? 0]),
      ),
    [dailySalesRecords],
  );

  const [selectedDate, setSelectedDate] = useState(today);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setSelectedDate(dateParam);
      setIsFormOpen(false);
    }
  }, [searchParams]);

  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [inputMode, setInputMode] = useState<DiscountsInputMode>("gross");
  const [isPending, startTransition] = useTransition();

  const isExisting = recordsByDate.has(selectedDate);
  const fieldsEditable = canEdit && isFormOpen;

  const totals = useMemo(() => {
    const asRecord: VenueDailyDiscountsRecord = {
      ...form,
      venue_id: "",
      created_by: null,
      updated_by: null,
      created_at: "",
      updated_at: "",
    };
    return computeDailyDiscounts(asRecord, totalTaxPct);
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
    SAVE_FIELDS.forEach((field) => formData.set(field, String(form[field])));

    const result = await saveVenueDailyDiscountsEntry(formData);
    if (result.error) {
      toast.error(result.error);
      return false;
    }

    const updated = result.record ? recordToForm(result.record) : form;
    setForm(updated);
    syncBaseline(updated);
    toast.saved(result.success ?? "Saved to cloud.");
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

  function updateField(field: VenueDailyDiscountsInputField, value: string) {
    const parsed = Number.parseFloat(value);
    setForm((prev) => ({
      ...prev,
      [field]:
        !Number.isFinite(parsed) || parsed < 0
          ? 0
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
        datesWithEntries={datesWithEntries}
      />

      <div className="space-y-3 text-center">
        {isFormOpen ? (
          <p className="text-sm text-black/60">
            Enter discount amounts as{" "}
            <span className="font-medium text-[#3D421F]">Gross</span> or{" "}
            <span className="font-medium text-[#3D421F]">Net</span> using the
            toggle. Values are saved as gross; combined tax rate{" "}
            {formatPct(totalTaxPct)}% is applied for net conversions.
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
            You have view-only access for discounts entry.
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
        <div
          className={cn(
            salesFormColumnWidthClass(),
            "flex flex-col gap-6 self-start",
          )}
        >
          <ServiceColumn
            title="Discounts"
            fields={DISCOUNT_FIELDS}
            form={form}
            canEdit={fieldsEditable}
            inputMode={inputMode}
            totalTaxPct={totalTaxPct}
            onInputModeChange={setInputMode}
            onChange={updateField}
          />
          <DiscountsValidationColumn
            discountsTotalGs={
              totals.totalFoodDiscountGs +
              totals.totalBeveragesDiscountGs +
              totals.totalWineDiscountGs +
              totals.totalShishaDiscountGs +
              totals.totalOthersDiscountGs
            }
            allDayDiscountGs={allDayDiscountByDate.get(selectedDate) ?? 0}
          />
        </div>
        <DiscountsTotalsColumn totals={totals} />
      </SalesFormColumnsLayout>
    </div>
  );
}
