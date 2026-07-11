"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveVenueWaiterDailySalesEntry } from "@/lib/actions/sales";
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
import { computeWaiterSales, computeWaiterSalesReconciliation } from "@/lib/sales/waiter-sales-calculations";
import type { VenueTender } from "@/lib/sales/tenders-types";
import type {
  VenueWaiterDailySalesEntry,
  WaiterSalesScalarField,
} from "@/lib/sales/waiter-sales-types";
import type { VenueWaiter } from "@/lib/sales/waiters-types";
import { BulletedCommentTextarea } from "@/components/sales/bulleted-comment-textarea";
import { SalesEntryDateBar } from "@/components/sales/sales-entry-date-bar";
import { SalesEntryDateBanner } from "@/components/sales/sales-entry-date-banner";
import {
  SalesFormColumnsLayout,
  SalesFormFieldRow,
  SalesFormInputModeToggle,
  SalesFormSectionHeader,
  SalesFormThreeColumnGroup,
  salesFormColumnClassName,
  salesFormColumnShellClass,
  salesFormColumnWidthClass,
} from "@/components/sales/sales-form-field-row";
import { SalesNumericInput } from "@/components/sales/sales-numeric-input";
import { useSalesFormUnsavedGuard } from "@/components/sales/use-sales-form-unsaved-guard";
import { WaiterSelectBar } from "@/components/sales/waiter-select-bar";
import { AutoDismissToast } from "@/components/ui/auto-dismiss-toast";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type WaiterSalesEntryFormProps = {
  waiters: VenueWaiter[];
  tenders: VenueTender[];
  records: VenueWaiterDailySalesEntry[];
  totalTaxPct: number;
  groupsAddedServiceChargePct: number;
  canEdit: boolean;
};

type SalesInputMode = "gross" | "net";

type FormState = {
  id: string;
  waiter_id: string;
  sale_date: string;
  total_sales_gs: number;
  total_payments_gs: number;
  gratuity_cc_gs: number;
  gratuity_cash_gs: number;
  groups_service_charge_gs: number;
  total_covers: number;
  voucher_comments: string;
  deposit_comments: string;
  on_accounts_comments: string;
  tender_amounts: Record<string, number>;
};

const SUMMARY_MONEY_FIELDS: WaiterSalesScalarField[] = [
  "total_sales_gs",
  "total_payments_gs",
];

const GRATUITY_FIELDS: WaiterSalesScalarField[] = [
  "gratuity_cc_gs",
  "gratuity_cash_gs",
];

const FIELD_LABELS: Record<WaiterSalesScalarField, string> = {
  total_sales_gs: "Sales Total",
  total_payments_gs: "Payment Total",
  gratuity_cc_gs: "Credit Card Gratuity",
  gratuity_cash_gs: "Cash Gratuity",
  groups_service_charge_gs: "Groups Service Charge",
  total_covers: "Total Covers",
};

function recordKey(waiterId: string, saleDate: string) {
  return `${waiterId}:${saleDate}`;
}

function emptyForm(waiterId: string, saleDate: string, tenderIds: string[]): FormState {
  const tender_amounts = Object.fromEntries(tenderIds.map((id) => [id, 0]));
  return {
    id: "",
    waiter_id: waiterId,
    sale_date: saleDate,
    total_sales_gs: 0,
    total_payments_gs: 0,
    gratuity_cc_gs: 0,
    gratuity_cash_gs: 0,
    groups_service_charge_gs: 0,
    total_covers: 0,
    voucher_comments: "",
    deposit_comments: "",
    on_accounts_comments: "",
    tender_amounts,
  };
}

function recordToForm(
  record: VenueWaiterDailySalesEntry,
  tenderIds: string[],
): FormState {
  const tender_amounts = Object.fromEntries(
    tenderIds.map((id) => [id, record.tender_amounts[id] ?? 0]),
  );
  return {
    id: record.id,
    waiter_id: record.waiter_id,
    sale_date: record.sale_date,
    total_sales_gs: record.total_sales_gs,
    total_payments_gs: record.total_payments_gs,
    gratuity_cc_gs: record.gratuity_cc_gs,
    gratuity_cash_gs: record.gratuity_cash_gs,
    groups_service_charge_gs: record.groups_service_charge_gs ?? 0,
    total_covers: record.total_covers,
    voucher_comments: record.voucher_comments ?? "",
    deposit_comments: record.deposit_comments ?? "",
    on_accounts_comments: record.on_accounts_comments ?? "",
    tender_amounts,
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function textareaClass(disabled: boolean) {
  return cn(
    "min-h-[6rem] w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] placeholder:text-black/35",
    disabled && "cursor-not-allowed opacity-60",
  );
}

function formatDifference(value: number): string {
  if (value === 0) return formatMoney(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function ReconciliationRow({
  label,
  entered,
  expected,
  difference,
}: {
  label: string;
  entered: number;
  expected: number;
  difference: number;
}) {
  const balanced = difference === 0;

  return (
    <div className="rounded-lg border border-black/10 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-black/50">
        {label}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Entered
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-[#3D421F]">
            {formatMoney(entered)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Expected
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-[#3D421F]">
            {formatMoney(expected)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Difference
          </p>
          <p
            className={cn(
              "mt-0.5 text-lg font-bold tabular-nums",
              balanced ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {balanced ? "Balanced" : formatDifference(difference)}
          </p>
        </div>
      </div>
    </div>
  );
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

export function WaiterSalesEntryForm({
  waiters,
  tenders,
  records,
  totalTaxPct,
  groupsAddedServiceChargePct,
  canEdit,
}: WaiterSalesEntryFormProps) {
  const today = formatLocalDate(new Date());
  const searchParams = useSearchParams();
  const tenderIds = useMemo(() => tenders.map((t) => t.id), [tenders]);

  const recordsByKey = useMemo(
    () =>
      new Map(
        records.map((r) => [recordKey(r.waiter_id, r.sale_date), r]),
      ),
    [records],
  );

  const [selectedWaiterId, setSelectedWaiterId] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [inputMode, setInputMode] = useState<SalesInputMode>("gross");
  const [form, setForm] = useState<FormState>(() =>
    emptyForm("", today, tenderIds),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dateParam = searchParams.get("date");
    const waiterParam = searchParams.get("waiter");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setSelectedDate(dateParam);
      setIsFormOpen(false);
    }
    if (waiterParam && waiters.some((w) => w.id === waiterParam)) {
      setSelectedWaiterId(waiterParam);
      setIsFormOpen(false);
    }
  }, [searchParams, waiters]);

  const selectedWaiter = waiters.find((w) => w.id === selectedWaiterId);
  const isExisting = Boolean(
    selectedWaiterId &&
      recordsByKey.has(recordKey(selectedWaiterId, selectedDate)),
  );
  const fieldsEditable = canEdit && isFormOpen && Boolean(selectedWaiterId);

  const computed = useMemo(
    () =>
      computeWaiterSales({
        total_sales_gs: form.total_sales_gs,
        total_covers: form.total_covers,
      }),
    [form.total_sales_gs, form.total_covers],
  );

  const tendersTotalGross = useMemo(
    () =>
      Math.round(
        Object.values(form.tender_amounts).reduce(
          (sum, amount) => sum + amount,
          0,
        ) * 100,
      ) / 100,
    [form.tender_amounts],
  );

  const tendersTotalNet = useMemo(
    () =>
      Math.round(grossToNet(tendersTotalGross, totalTaxPct) * 100) / 100,
    [tendersTotalGross, totalTaxPct],
  );

  const reconciliation = useMemo(
    () =>
      computeWaiterSalesReconciliation(
        {
          total_sales_gs: form.total_sales_gs,
          total_payments_gs: form.total_payments_gs,
          gratuity_cc_gs: form.gratuity_cc_gs,
        },
        tendersTotalGross,
      ),
    [
      form.total_sales_gs,
      form.total_payments_gs,
      form.gratuity_cc_gs,
      tendersTotalGross,
    ],
  );

  const saveFormRef = useRef<() => Promise<boolean>>(async () => false);
  const { syncBaseline, guardAction, unsavedDialog } = useSalesFormUnsavedGuard({
    isEditing: isFormOpen,
    state: form,
    onSaveRef: saveFormRef,
  });

  saveFormRef.current = async () => {
    if (!selectedWaiterId) return false;

    setMessage(null);

    const formData = new FormData();
    if (form.id) formData.set("id", form.id);
    formData.set("waiter_id", selectedWaiterId);
    formData.set("sale_date", selectedDate);
    formData.set("total_sales_gs", String(form.total_sales_gs));
    formData.set("total_payments_gs", String(form.total_payments_gs));
    formData.set("gratuity_cc_gs", String(form.gratuity_cc_gs));
    formData.set("gratuity_cash_gs", String(form.gratuity_cash_gs));
    formData.set(
      "groups_service_charge_gs",
      String(form.groups_service_charge_gs),
    );
    formData.set("total_covers", String(form.total_covers));
    formData.set("voucher_comments", form.voucher_comments);
    formData.set("deposit_comments", form.deposit_comments);
    formData.set("on_accounts_comments", form.on_accounts_comments);
    for (const [tenderId, amount] of Object.entries(form.tender_amounts)) {
      formData.set(`tender_${tenderId}`, String(amount));
    }

    const result = await saveVenueWaiterDailySalesEntry(formData);
    if (result.error) {
      setMessage(result.error);
      return false;
    }

    const updated = result.record
      ? recordToForm(result.record, tenderIds)
      : form;
    setForm(updated);
    syncBaseline(updated);
    setSaveToast("Details saved and uploaded to the cloud.");
    return true;
  };

  function displayMoney(gross: number): number {
    if (inputMode === "gross") return gross;
    return Math.round(grossToNet(gross, totalTaxPct) * 100) / 100;
  }

  function applyMoneyChange(field: WaiterSalesScalarField, raw: string) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      updateScalarField(field, 0);
      return;
    }
    const gross =
      inputMode === "gross"
        ? parsed
        : Math.round(netToGross(parsed, totalTaxPct) * 100) / 100;
    updateScalarField(field, gross);
  }

  function applyTenderChange(tenderId: string, raw: string) {
    const parsed = Number.parseFloat(raw);
    const gross =
      !Number.isFinite(parsed) || parsed < 0
        ? 0
        : inputMode === "gross"
          ? parsed
          : Math.round(netToGross(parsed, totalTaxPct) * 100) / 100;
    setForm((prev) => ({
      ...prev,
      tender_amounts: {
        ...prev.tender_amounts,
        [tenderId]: Math.round(gross * 100) / 100,
      },
    }));
  }

  function updateScalarField(field: WaiterSalesScalarField, value: number) {
    setForm((prev) => ({
      ...prev,
      [field]: field === "total_covers" ? Math.max(0, Math.trunc(value)) : value,
    }));
  }

  function updateCommentField(
    field: "voucher_comments" | "deposit_comments" | "on_accounts_comments",
    value: string,
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleWaiterSelect(waiterId: string) {
    guardAction(() => {
      setSelectedWaiterId(waiterId);
      setIsFormOpen(false);
      setMessage(null);
    });
  }

  function handleDateChange(date: string) {
    guardAction(() => {
      setSelectedDate(date);
      setIsFormOpen(false);
      setMessage(null);
    });
  }

  function formForSelection(waiterId: string, date: string): FormState {
    if (!waiterId) return emptyForm("", date, tenderIds);
    const existing = recordsByKey.get(recordKey(waiterId, date));
    return existing
      ? recordToForm(existing, tenderIds)
      : emptyForm(waiterId, date, tenderIds);
  }

  useEffect(() => {
    if (isFormOpen) return;
    const next = formForSelection(selectedWaiterId, selectedDate);
    setForm(next);
    syncBaseline(next);
  }, [
    selectedDate,
    selectedWaiterId,
    recordsByKey,
    isFormOpen,
    syncBaseline,
    tenderIds,
  ]);

  function openForm() {
    if (!selectedWaiterId) return;
    if (!canCreateSalesEntryForDate(selectedDate, isExisting)) {
      setMessage(FUTURE_SALES_ENTRY_ERROR);
      return;
    }
    const initial = formForSelection(selectedWaiterId, selectedDate);
    setForm(initial);
    syncBaseline(initial);
    setIsFormOpen(true);
    setMessage(null);
  }

  function handleSave() {
    startTransition(() => {
      void saveFormRef.current();
    });
  }

  if (waiters.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">No active waiters</h2>
        <p className="mt-2 text-sm text-black/60">
          Add active waiters in{" "}
          <Link
            href="/sales/settings/waiters"
            className="font-medium text-[var(--venue-primary)] underline-offset-2 hover:underline"
          >
            Settings → Waiters
          </Link>{" "}
          before recording waiter sales.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {unsavedDialog}
      <WaiterSelectBar
        waiters={waiters}
        selectedWaiterId={selectedWaiterId}
        onSelect={handleWaiterSelect}
      />

      <SalesEntryDateBar
        selectedDate={selectedDate}
        canEdit={canEdit && Boolean(selectedWaiterId)}
        onDateChange={handleDateChange}
        isFormOpen={isFormOpen}
        isExisting={isExisting}
        isPending={isPending}
        onOpenForm={openForm}
        onSave={handleSave}
        extraBadges={
          selectedWaiter ? (
            <span className="inline-flex h-10 shrink-0 items-center rounded-full border border-black/10 bg-[var(--venue-secondary)]/30 px-3 text-sm text-black/60">
              {selectedWaiter.name}
            </span>
          ) : null
        }
      />

      <div className="space-y-3 text-center">
        {isFormOpen ? (
          <p className="text-sm text-black/60">
            Enter amounts as{" "}
            <span className="font-medium text-[#3D421F]">Gross</span> or{" "}
            <span className="font-medium text-[#3D421F]">Net</span>. Values
            save as gross; tax rate {formatPct(totalTaxPct)}%.
          </p>
        ) : !selectedWaiterId ? (
          <p className="text-sm text-black/50">
            Select a waiter to view or enter sales for this date.
          </p>
        ) : isFutureSalesEntryDate(selectedDate) && !isExisting ? (
          <p className="text-sm text-black/50">{FUTURE_SALES_ENTRY_ERROR}</p>
        ) : canEdit ? (
          <p className="text-sm text-black/50">
            Viewing {isExisting ? "saved entry" : "empty day"} for{" "}
            {selectedWaiter?.name ?? "this waiter"}. Click{" "}
            {isExisting ? "Edit entry" : "Create entry"} to make changes.
          </p>
        ) : (
          <p className="text-sm text-black/50">
            You have view-only access for waiter sales entry.
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

      <SalesFormThreeColumnGroup>
        <SalesFormColumnsLayout>
          <Card className={salesFormColumnClassName("shadow-sm backdrop-blur-xl")}>
            <SalesFormSectionHeader
              title="Summary"
              action={
                <InputModeToggle
                  mode={inputMode}
                  onChange={setInputMode}
                  disabled={!fieldsEditable}
                />
              }
            />
            <div className="space-y-2">
              {SUMMARY_MONEY_FIELDS.map((field) => (
                <SalesFormFieldRow
                  key={field}
                  label={
                    field === "total_sales_gs" ? (
                      <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-right">
                        <span>{FIELD_LABELS[field]}</span>
                        <span className="text-xs text-black/45">
                          Excluding Gratuity
                        </span>
                      </span>
                    ) : (
                      FIELD_LABELS[field]
                    )
                  }
                >
                  <SalesNumericInput
                    key={`${field}-${form.id}-${inputMode}`}
                    value={displayMoney(form[field])}
                    disabled={!fieldsEditable}
                    onChange={(v) => applyMoneyChange(field, v)}
                  />
                </SalesFormFieldRow>
              ))}
              <SalesFormFieldRow label="Total Covers">
                <SalesNumericInput
                  key={`covers-${form.id}`}
                  value={form.total_covers}
                  disabled={!fieldsEditable}
                  isInteger
                  onChange={(v) =>
                    updateScalarField(
                      "total_covers",
                      Number.parseInt(v, 10) || 0,
                    )
                  }
                />
              </SalesFormFieldRow>
              <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-black/50">
                  ASPH
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#3D421F]">
                  {formatMoney(computed.asph)}
                </p>
                <p className="mt-1 text-xs text-black/50">
                  Sales Total ÷ Total Covers
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-2 border-t border-black/10 pt-4">
              <SalesFormSectionHeader title="Gratuity collected" />
              {GRATUITY_FIELDS.map((field) => (
                <SalesFormFieldRow key={field} label={FIELD_LABELS[field]}>
                  <SalesNumericInput
                    key={`${field}-${form.id}-${inputMode}`}
                    value={displayMoney(form[field])}
                    disabled={!fieldsEditable}
                    onChange={(v) => applyMoneyChange(field, v)}
                  />
                </SalesFormFieldRow>
              ))}
              <SalesFormFieldRow
                label={
                  <>
                    Groups Total Collected Service Charge Value{" "}
                    {formatPct(groupsAddedServiceChargePct)}%
                  </>
                }
              >
                <SalesNumericInput
                  key={`groups-sc-${form.id}-${inputMode}`}
                  value={displayMoney(form.groups_service_charge_gs)}
                  disabled={!fieldsEditable}
                  onChange={(v) =>
                    applyMoneyChange("groups_service_charge_gs", v)
                  }
                />
              </SalesFormFieldRow>
            </div>
          </Card>

          <Card className={salesFormColumnClassName("space-y-4 shadow-sm backdrop-blur-xl")}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-serif text-lg font-bold text-[#3D421F]">Tenders Total</h3>
              {tenders.length === 0 ? (
                <Link
                  href="/sales/settings/tenders"
                  className="text-sm font-medium text-[var(--venue-primary)] underline-offset-2 hover:underline"
                >
                  Configure tenders
                </Link>
              ) : null}
            </div>
            {tenders.length === 0 ? (
              <p className="text-sm text-black/50">
                No active tenders. Add them in Settings → Tenders.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {tenders.map((tender) => (
                    <SalesFormFieldRow key={tender.id} label={tender.name}>
                      <SalesNumericInput
                        key={`${tender.id}-${form.id}-${inputMode}`}
                        value={displayMoney(
                          form.tender_amounts[tender.id] ?? 0,
                        )}
                        disabled={!fieldsEditable}
                        onChange={(v) => applyTenderChange(tender.id, v)}
                      />
                    </SalesFormFieldRow>
                  ))}
                </div>
                <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-black/50">
                    Total
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                        Gross
                      </p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-[#3D421F]">
                        {formatMoney(tendersTotalGross)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                        Net
                      </p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-[#3D421F]">
                        {formatMoney(tendersTotalNet)}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>

          <Card className={salesFormColumnClassName("space-y-4 shadow-sm backdrop-blur-xl")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-serif text-lg font-bold text-[#3D421F]">
                Balance check
              </h3>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
                  reconciliation.isBalanced
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800",
                )}
              >
                {reconciliation.isBalanced ? "Balanced" : "Difference found"}
              </span>
            </div>
            <p className="text-sm text-black/60">
              Payment Total and the tenders total should both equal{" "}
              <span className="font-medium text-[#3D421F]">
                Sales Total + Credit Card Gratuity
              </span>
              .
            </p>
            <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-black/50">
                Expected total
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#3D421F]">
                {formatMoney(reconciliation.expectedPaymentsGs)}
              </p>
              <p className="mt-1 text-xs text-black/50">
                Sales Total + Credit Card Gratuity
              </p>
            </div>
            <div className="space-y-3">
              <ReconciliationRow
                label="Payment Total"
                entered={form.total_payments_gs}
                expected={reconciliation.expectedPaymentsGs}
                difference={reconciliation.paymentsDifferenceGs}
              />
              <ReconciliationRow
                label="Tenders total"
                entered={tendersTotalGross}
                expected={reconciliation.expectedPaymentsGs}
                difference={reconciliation.tendersDifferenceGs}
              />
            </div>
          </Card>
        </SalesFormColumnsLayout>

        <Card className="w-full space-y-4 border border-black/5 bg-white/60 p-5 shadow-sm backdrop-blur-xl">
          <h3 className="font-serif text-lg font-bold text-[#3D421F]">Comments</h3>
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block text-sm">
              <span className="text-black/60">Voucher Comments</span>
              <BulletedCommentTextarea
                disabled={!fieldsEditable}
                value={form.voucher_comments}
                onChange={(value) =>
                  updateCommentField("voucher_comments", value)
                }
                placeholder="For each Voucher reference include the: Voucher Name | Number | Value"
                className={cn(textareaClass(!fieldsEditable), "mt-1")}
              />
            </label>
            <label className="block text-sm">
              <span className="text-black/60">Deposit Comments</span>
              <BulletedCommentTextarea
                disabled={!fieldsEditable}
                value={form.deposit_comments}
                onChange={(value) =>
                  updateCommentField("deposit_comments", value)
                }
                placeholder="For each Deposit reference include the: Acount Name | Value"
                className={cn(textareaClass(!fieldsEditable), "mt-1")}
              />
            </label>
            <label className="block text-sm">
              <span className="text-black/60">On Accounts Comments</span>
              <BulletedCommentTextarea
                disabled={!fieldsEditable}
                value={form.on_accounts_comments}
                onChange={(value) =>
                  updateCommentField("on_accounts_comments", value)
                }
                placeholder="For each On-Accounts reference include the: Acount Name | Value"
                className={cn(textareaClass(!fieldsEditable), "mt-1")}
              />
            </label>
          </div>
        </Card>
      </SalesFormThreeColumnGroup>

      <AutoDismissToast
        message={saveToast}
        onDismiss={() => setSaveToast(null)}
      />
    </div>
  );
}
