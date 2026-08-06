"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  HandCoins,
  Landmark,
  Minus,
  Plus,
  Receipt,
  Scale,
  Wallet,
} from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { SalesEntryDateBar } from "@/components/sales/sales-entry-date-bar";
import { SalesEntryDateBanner } from "@/components/sales/sales-entry-date-banner";
import {
  SalesFormColumnsLayout,
  SalesFormFieldRow,
  SalesFormSectionHeader,
  salesFormColumnClassName,
  salesFormColumnShellClass,
  salesFormFieldInputClass,
} from "@/components/sales/sales-form-field-row";
import { SalesNumericInput } from "@/components/sales/sales-numeric-input";
import { usePersistedSalesEntryDate } from "@/components/sales/use-persisted-sales-filters";
import { useSalesFormUnsavedGuard } from "@/components/sales/use-sales-form-unsaved-guard";
import { toast } from "@/components/ui/toast";
import { saveVenueCashJournalEntry } from "@/lib/actions/sales";
import type { CashSalesRecord } from "@/lib/sales/cash-sales-report";
import {
  coalesceCashJournalTillAmount,
  computeCashJournalBalance,
  isCashJournalBalanced,
} from "@/lib/sales/cash-journal-calculations";
import type { VenueCashJournalRecord } from "@/lib/sales/cash-journal-types";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySnapCashDrawerRow } from "@/lib/sales/daily-snap-store";
import type { VenueWaiterGratuityRow } from "@/lib/sales/waiter-sales-store";
import {
  canCreateSalesEntryForDate,
  FUTURE_SALES_ENTRY_ERROR,
  getLocalTodayIsoDate,
  isFutureSalesEntryDate,
} from "@/lib/sales/sales-entry-dates";
import { cn } from "@/lib/utils";

type EditableField =
  | "openTillGs"
  | "cashWithdrawGs"
  | "cashExpensesGs"
  | "cashDepositGs"
  | "closingTillGs";

type JournalDraft = {
  id?: string;
  sale_date: string;
  openTillGs: number;
  cashWithdrawGs: number;
  cashExpensesGs: number;
  cashDepositGs: number;
  closingTillGs: number;
  comments: string;
};

type CashJournalEntryFormProps = {
  journalRecords: VenueCashJournalRecord[];
  cashDrawerRows: VenueDailySnapCashDrawerRow[];
  cashSalesRows: CashSalesRecord[];
  cashGratuityRows: VenueWaiterGratuityRow[];
  canEdit: boolean;
};

function emptyDraft(date: string): JournalDraft {
  return {
    sale_date: date,
    openTillGs: 0,
    cashWithdrawGs: 0,
    cashExpensesGs: 0,
    cashDepositGs: 0,
    closingTillGs: 0,
    comments: "",
  };
}

function FieldIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />;
}

/** Cash drawer / till */
const cashDrawerSymbol = <FieldIcon icon={Wallet} />;
/** Bank withdraw (+) */
const bankInSymbol = (
  <span className="inline-flex items-center gap-px">
    <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
    <Landmark className="h-3.5 w-3.5" strokeWidth={1.75} />
  </span>
);
/** Bank deposit (−) */
const bankOutSymbol = (
  <span className="inline-flex items-center gap-px">
    <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
    <Landmark className="h-3.5 w-3.5" strokeWidth={1.75} />
  </span>
);
const cashSalesSymbol = <FieldIcon icon={Banknote} />;
const gratuitySymbol = <FieldIcon icon={HandCoins} />;
const expensesSymbol = <FieldIcon icon={Receipt} />;
const balanceSymbol = <FieldIcon icon={Scale} />;

function ReadOnlyMoneyField({
  label,
  value,
  hint,
  symbol,
}: {
  label: string;
  value: number;
  hint?: React.ReactNode;
  symbol?: React.ReactNode;
}) {
  const empty = value === 0;
  return (
    <div>
      <SalesFormFieldRow label={label} symbol={symbol}>
        <div
          className={cn(
            salesFormFieldInputClass(true),
            "flex items-center justify-end font-medium",
            empty && "text-black/35",
          )}
        >
          {empty ? "—" : formatMoney(value)}
        </div>
      </SalesFormFieldRow>
      {hint && empty ? (
        <p className="mt-1 pr-[calc(8.5rem+1rem)] text-right text-[10px] text-black/40">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function CashJournalEntryForm({
  journalRecords,
  cashDrawerRows,
  cashSalesRows,
  cashGratuityRows,
  canEdit,
}: CashJournalEntryFormProps) {
  const today = getLocalTodayIsoDate();
  const searchParams = useSearchParams();

  const recordsByDate = useMemo(() => {
    const map = new Map<string, VenueCashJournalRecord>();
    for (const record of journalRecords) {
      map.set(record.sale_date, record);
    }
    return map;
  }, [journalRecords]);

  const openTillByDate = useMemo(
    () =>
      new Map(
        cashDrawerRows.map((row) => [
          row.sale_date,
          row.cash_drawer_opening_gs,
        ]),
      ),
    [cashDrawerRows],
  );
  const closingTillByDate = useMemo(
    () =>
      new Map(
        cashDrawerRows.map((row) => [
          row.sale_date,
          row.cash_drawer_closing_gs,
        ]),
      ),
    [cashDrawerRows],
  );
  const cashSalesByDate = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of cashSalesRows) {
      const current = totals.get(row.sale_date) ?? 0;
      totals.set(
        row.sale_date,
        Math.round((current + row.amount_gs) * 100) / 100,
      );
    }
    return totals;
  }, [cashSalesRows]);

  const cashGratuityByDate = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of cashGratuityRows) {
      const current = totals.get(row.sale_date) ?? 0;
      totals.set(
        row.sale_date,
        Math.round((current + row.gratuity_cash_gs) * 100) / 100,
      );
    }
    return totals;
  }, [cashGratuityRows]);

  const { selectedDate, setSelectedDate } = usePersistedSalesEntryDate(today);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<JournalDraft>(() => emptyDraft(today));
  const [isPending, startTransition] = useTransition();

  const isExisting = recordsByDate.has(selectedDate);
  const fieldsEditable = canEdit && isFormOpen;

  const totalCashSalesGs = cashSalesByDate.get(selectedDate) ?? 0;
  const cashGratuityGs = cashGratuityByDate.get(selectedDate) ?? 0;

  const balanceGs = useMemo(
    () =>
      computeCashJournalBalance({
        openTillGs: form.openTillGs,
        cashWithdrawGs: form.cashWithdrawGs,
        totalCashSalesGs,
        cashGratuityGs,
        cashExpensesGs: form.cashExpensesGs,
        cashDepositGs: form.cashDepositGs,
        closingTillGs: form.closingTillGs,
      }),
    [
      form.openTillGs,
      form.cashWithdrawGs,
      totalCashSalesGs,
      cashGratuityGs,
      form.cashExpensesGs,
      form.cashDepositGs,
      form.closingTillGs,
    ],
  );
  const balanced = isCashJournalBalanced(balanceGs);

  const datesWithEntries = useMemo(
    () => new Set(journalRecords.map((record) => record.sale_date)),
    [journalRecords],
  );

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
    formData.set("open_till_gs", String(form.openTillGs));
    formData.set("cash_withdraw_gs", String(form.cashWithdrawGs));
    formData.set("cash_expenses_gs", String(form.cashExpensesGs));
    formData.set("cash_deposit_gs", String(form.cashDepositGs));
    formData.set("closing_till_gs", String(form.closingTillGs));
    formData.set("comments", form.comments);

    const result = await saveVenueCashJournalEntry(formData);
    if (result.error) {
      toast.error(result.error);
      return false;
    }

    const updated = result.record
      ? draftFromSources(selectedDate, result.record)
      : draftFromSources(selectedDate, null);
    setForm(updated);
    syncBaseline(updated);
    toast.saved(result.success ?? "Saved to cloud.");
    setIsFormOpen(false);
    return true;
  };

  const dateParam = searchParams.get("date");

  useEffect(() => {
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    setSelectedDate(dateParam);
    setIsFormOpen(false);
    // Omit setSelectedDate — new function identity every render was forcing view mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when URL date changes
  }, [dateParam]);

  function draftFromSources(
    date: string,
    record: VenueCashJournalRecord | null | undefined,
  ): JournalDraft {
    const snapOpen = openTillByDate.get(date) ?? 0;
    const snapClosing = closingTillByDate.get(date) ?? 0;
    if (!record) {
      return {
        ...emptyDraft(date),
        openTillGs: snapOpen,
        closingTillGs: snapClosing,
      };
    }
    return {
      id: record.id,
      sale_date: record.sale_date,
      openTillGs: coalesceCashJournalTillAmount(record.open_till_gs, snapOpen),
      cashWithdrawGs: record.cash_withdraw_gs,
      cashExpensesGs: record.cash_expenses_gs,
      cashDepositGs: record.cash_deposit_gs,
      closingTillGs: coalesceCashJournalTillAmount(
        record.closing_till_gs,
        snapClosing,
      ),
      comments: record.comments ?? "",
    };
  }

  function formForDate(date: string): JournalDraft {
    return draftFromSources(date, recordsByDate.get(date));
  }

  useEffect(() => {
    if (isFormOpen) return;
    const next = formForDate(selectedDate);
    setForm(next);
    syncBaseline(next);
  }, [
    selectedDate,
    recordsByDate,
    openTillByDate,
    closingTillByDate,
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

  function updateField(field: EditableField, value: string) {
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
            Edit open/closing till (synced with{" "}
            <Link
              href={`/sales/daily-snap?date=${selectedDate}`}
              className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
            >
              Daily Snap
            </Link>
            ), withdraw, expenses, and deposit. Cash sales and cash gratuity are
            read-only from Daily Sales / Waiter Sales.
          </p>
        ) : isFutureSalesEntryDate(selectedDate) && !isExisting ? (
          <p className="text-sm text-black/50">{FUTURE_SALES_ENTRY_ERROR}</p>
        ) : canEdit ? (
          <p className="text-sm text-black/50">
            Viewing {isExisting ? "saved entry" : "empty day"} for this date.
            Click {isExisting ? "Edit entry" : "Create entry"} to make changes.
          </p>
        ) : (
          <p className="text-sm text-black/50">
            You have view-only access for cash journal entry.
          </p>
        )}

        <SalesFormColumnsLayout>
          <div
            className={cn(
              salesFormColumnShellClass(),
              "min-w-[min(100%,16rem)] max-w-[24rem] flex-[1_1_22rem]",
              "items-center justify-center py-3 text-center text-sm font-medium tabular-nums text-[#3D421F] shadow-sm",
            )}
          >
            <SalesEntryDateBanner dateStr={selectedDate} />
          </div>
        </SalesFormColumnsLayout>
      </div>

      <SalesFormColumnsLayout>
        <div className={salesFormColumnClassName("min-w-[min(100%,16rem)] max-w-[24rem] flex-[1_1_22rem]")}>
          <SalesFormSectionHeader title="Cash Journal" />
          <div className="space-y-2">
            <SalesFormFieldRow label="Open till value" symbol={cashDrawerSymbol}>
              <SalesNumericInput
                key={`open-${form.sale_date}-${isFormOpen}`}
                value={form.openTillGs}
                disabled={!fieldsEditable}
                onChange={(v) => updateField("openTillGs", v)}
                className="bg-neutral-100"
              />
            </SalesFormFieldRow>
            <div aria-hidden className="border-t border-black/10" />
            <SalesFormFieldRow
              label="Cash Bank withdraw"
              symbol={bankInSymbol}
            >
              <SalesNumericInput
                key={`withdraw-${form.sale_date}-${isFormOpen}`}
                value={form.cashWithdrawGs}
                disabled={!fieldsEditable}
                onChange={(v) => updateField("cashWithdrawGs", v)}
              />
            </SalesFormFieldRow>
            <ReadOnlyMoneyField
              label="Total cash sales"
              value={totalCashSalesGs}
              symbol={cashSalesSymbol}
              hint="From Daily Sales cash tender"
            />
            <ReadOnlyMoneyField
              label="Cash gratuity"
              value={cashGratuityGs}
              symbol={gratuitySymbol}
              hint={
                <>
                  From{" "}
                  <Link
                    href="/sales/waiter/entry"
                    className="underline-offset-2 hover:underline"
                  >
                    Waiter Sales
                  </Link>
                </>
              }
            />
            <SalesFormFieldRow label="Cash expenses" symbol={expensesSymbol}>
              <SalesNumericInput
                key={`expenses-${form.sale_date}-${isFormOpen}`}
                value={form.cashExpensesGs}
                disabled={!fieldsEditable}
                onChange={(v) => updateField("cashExpensesGs", v)}
              />
            </SalesFormFieldRow>
            <SalesFormFieldRow
              label="Cash Bank deposit"
              symbol={bankOutSymbol}
            >
              <SalesNumericInput
                key={`deposit-${form.sale_date}-${isFormOpen}`}
                value={form.cashDepositGs}
                disabled={!fieldsEditable}
                onChange={(v) => updateField("cashDepositGs", v)}
              />
            </SalesFormFieldRow>
            <div aria-hidden className="border-t border-black/10" />
            <SalesFormFieldRow
              label="Closing till value"
              symbol={cashDrawerSymbol}
            >
              <SalesNumericInput
                key={`closing-${form.sale_date}-${isFormOpen}`}
                value={form.closingTillGs}
                disabled={!fieldsEditable}
                onChange={(v) => updateField("closingTillGs", v)}
                className="bg-neutral-100"
              />
            </SalesFormFieldRow>
            <SalesFormFieldRow label="Balance" symbol={balanceSymbol}>
              <div
                className={cn(
                  salesFormFieldInputClass(true),
                  "flex items-center justify-end font-bold",
                  balanced ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {formatMoney(balanceGs)}
              </div>
            </SalesFormFieldRow>
          </div>
        </div>

        <div
          className={salesFormColumnClassName(
            "gap-2 border-black/15 bg-[var(--venue-secondary,#F0F3DD)]",
          )}
        >
          <h3 className="font-serif text-lg font-bold text-[#3D421F]">
            Balance check
          </h3>
          <p className="text-center text-[11px] leading-relaxed text-black/50">
            Open till + Bank withdraw + Cash sales + Cash gratuity − Expenses −
            Bank deposit − Closing till = 0
          </p>
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-center",
              balanced
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-black/45">
              Balance
            </p>
            <p
              className={cn(
                "mt-0.5 text-lg font-bold tabular-nums",
                balanced ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {formatMoney(balanceGs)}
            </p>
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                balanced ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {balanced ? "Balanced" : "Does not balance to 0"}
            </p>
          </div>

          <label className="mt-1 flex flex-col gap-1 text-sm">
            <span className="text-black/60">Comments</span>
            <textarea
              disabled={!fieldsEditable}
              value={form.comments}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, comments: event.target.value }))
              }
              placeholder="Notes for this day…"
              rows={5}
              className={cn(
                "min-h-[7rem] w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] placeholder:text-black/35",
                !fieldsEditable && "cursor-not-allowed opacity-60",
              )}
            />
          </label>
        </div>
      </SalesFormColumnsLayout>
    </div>
  );
}
