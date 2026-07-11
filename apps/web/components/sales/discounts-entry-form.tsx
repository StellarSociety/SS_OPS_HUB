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

type DiscountsEntryFormProps = {
  records: VenueDailyDiscountsRecord[];
  totalTaxPct: number;
  canEdit: boolean;
};

type DiscountsInputMode = "gross" | "net";

type FormState = {
  id: string;
  sale_date: string;
  lunch_food_discount_gs: number;
  lunch_beverages_discount_gs: number;
  lunch_wine_discount_gs: number;
  lunch_shisha_discount_gs: number;
  lunch_others_discount_gs: number;
  dinner_food_discount_gs: number;
  dinner_beverages_discount_gs: number;
  dinner_wine_discount_gs: number;
  dinner_shisha_discount_gs: number;
  dinner_others_discount_gs: number;
};

const LUNCH_FIELDS: { key: VenueDailyDiscountsInputField; label: string }[] = [
  { key: "lunch_food_discount_gs", label: "Food Discounts" },
  { key: "lunch_beverages_discount_gs", label: "Beverages Discounts" },
  { key: "lunch_wine_discount_gs", label: "Wine Discounts" },
  { key: "lunch_shisha_discount_gs", label: "Shisha Discounts" },
  { key: "lunch_others_discount_gs", label: "Other Discounts" },
];

const DINNER_FIELDS: { key: VenueDailyDiscountsInputField; label: string }[] = [
  { key: "dinner_food_discount_gs", label: "Food Discounts" },
  { key: "dinner_beverages_discount_gs", label: "Beverages Discounts" },
  { key: "dinner_wine_discount_gs", label: "Wine Discounts" },
  { key: "dinner_shisha_discount_gs", label: "Shisha Discounts" },
  { key: "dinner_others_discount_gs", label: "Other Discounts" },
];

const SAVE_FIELDS: VenueDailyDiscountsInputField[] = [
  ...LUNCH_FIELDS.map((f) => f.key),
  ...DINNER_FIELDS.map((f) => f.key),
];

function emptyForm(date: string): FormState {
  return {
    id: "",
    sale_date: date,
    lunch_food_discount_gs: 0,
    lunch_beverages_discount_gs: 0,
    lunch_wine_discount_gs: 0,
    lunch_shisha_discount_gs: 0,
    lunch_others_discount_gs: 0,
    dinner_food_discount_gs: 0,
    dinner_beverages_discount_gs: 0,
    dinner_wine_discount_gs: 0,
    dinner_shisha_discount_gs: 0,
    dinner_others_discount_gs: 0,
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
    <div className="rounded-lg border border-black/10 bg-white px-4 py-3 text-center">
      <p className="text-xs font-medium tracking-wide text-black/50">{label}</p>
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

export function DiscountsEntryForm({
  records,
  totalTaxPct,
  canEdit,
}: DiscountsEntryFormProps) {
  const today = formatLocalDate(new Date());
  const searchParams = useSearchParams();
  const recordsByDate = useMemo(
    () => new Map(records.map((r) => [r.sale_date, r])),
    [records],
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
  const [lunchInputMode, setLunchInputMode] =
    useState<DiscountsInputMode>("gross");
  const [dinnerInputMode, setDinnerInputMode] =
    useState<DiscountsInputMode>("gross");
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage(null);

    const formData = new FormData();
    if (form.id) formData.set("id", form.id);
    formData.set("sale_date", selectedDate);
    SAVE_FIELDS.forEach((field) => formData.set(field, String(form[field])));

    const result = await saveVenueDailyDiscountsEntry(formData);
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
      />

      <div className="space-y-3 text-center">
        {isFormOpen ? (
          <p className="text-sm text-black/60">
            Enter discount amounts as{" "}
            <span className="font-medium text-[#3D421F]">Gross</span> or{" "}
            <span className="font-medium text-[#3D421F]">Net</span> using the
            toggle on each service period. Values are saved as gross; combined
            tax rate {formatPct(totalTaxPct)}% is applied for net conversions.
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

      {message ? (
        <p className="text-center text-sm text-black/60">{message}</p>
      ) : null}

      <SalesFormColumnsLayout>
        <ServiceColumn
          title="Lunch"
          fields={LUNCH_FIELDS}
          form={form}
          canEdit={fieldsEditable}
          inputMode={lunchInputMode}
          totalTaxPct={totalTaxPct}
          onInputModeChange={setLunchInputMode}
          onChange={updateField}
        />
        <ServiceColumn
          title="Dinner"
          fields={DINNER_FIELDS}
          form={form}
          canEdit={fieldsEditable}
          inputMode={dinnerInputMode}
          totalTaxPct={totalTaxPct}
          onInputModeChange={setDinnerInputMode}
          onChange={updateField}
        />
        <DiscountsTotalsColumn totals={totals} />
      </SalesFormColumnsLayout>
    </div>
  );
}
