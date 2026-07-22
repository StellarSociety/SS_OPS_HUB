"use client";

import { useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Pencil,
  Plus,
  Ticket,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  markVenueVoucherRedeemed,
  removeVenueVoucher,
  saveVenueVoucher,
} from "@/lib/actions/sales";
import { formatDisplayDate } from "@/lib/dates/display";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import {
  buildIssueDayAllocations,
  buildRedeemDayAllocations,
  formatLocalDate,
  issueDaysWithVoucherIssueTender,
  recentIssuedVouchers,
  recentRedeemedVouchers,
  reconcileVouchers,
  redeemDaysWithVoucherRedeemTender,
  summarizeVoucherLedger,
  voucherIssueAmount,
  voucherRedeemAmount,
} from "@/lib/sales/vouchers-calculations";
import type {
  VenueVoucher,
  VoucherDayAllocation,
  VoucherStatus,
  VoucherTenderTotals,
} from "@/lib/sales/vouchers-types";
import {
  VOUCHER_STATUS_LABELS,
} from "@/lib/sales/vouchers-types";
import { Card } from "@/components/ui/card";
import { SalesDateInput } from "@/components/sales/sales-date-input";
import { toast } from "@/components/ui/toast";
import { paymentFormTenders } from "@/lib/sales/tenders-calculations";
import type { VenueTender } from "@/lib/sales/tenders-types";
import {
  buildMonthlyVoucherExportCsv,
  defaultExportMonth,
  downloadTextFile,
  listAvailableExportMonths,
  summarizeMonthForExport,
  voucherExportFilename,
} from "@/lib/sales/vouchers-export";
import { cn } from "@/lib/utils";

type WorkspaceTab = "issue" | "redeem";

type VouchersPanelProps = {
  venueName: string;
  vouchers: VenueVoucher[];
  tenders: VenueTender[];
  tenderTotals: VoucherTenderTotals;
  canEdit: boolean;
};

type FormState = {
  id: string;
  voucher_number: string;
  voucher_name: string;
  face_value_gs: string;
  status: VoucherStatus;
  issued_date: string;
  redeemed_date: string;
  expires_date: string;
  payment_form_tender_id: string;
  purchaser_name: string;
  recipient_name: string;
  notes: string;
};

const inputClass =
  "mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[#3D421F]/35 disabled:opacity-60";

const dateFieldClass = "mt-1 flex h-10 w-full";
const dateFieldInputClass =
  "text-left outline-none focus:border-[#3D421F]/35 disabled:opacity-60";

const textareaClass =
  "mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[#3D421F]/35 disabled:opacity-60";

function emptyForm(
  overrides: Partial<FormState> = {},
): FormState {
  return {
    id: "",
    voucher_number: "",
    voucher_name: "",
    face_value_gs: "",
    status: "draft",
    issued_date: formatLocalDate(),
    redeemed_date: "",
    expires_date: "",
    payment_form_tender_id: "",
    purchaser_name: "",
    recipient_name: "",
    notes: "",
    ...overrides,
  };
}

function voucherToForm(voucher: VenueVoucher): FormState {
  return {
    id: voucher.id,
    voucher_number: voucher.voucher_number,
    voucher_name: voucher.voucher_name,
    face_value_gs: String(voucher.face_value_gs),
    status: voucher.status,
    issued_date: voucher.issued_date,
    redeemed_date: voucher.redeemed_date ?? "",
    expires_date: voucher.expires_date ?? "",
    payment_form_tender_id: voucher.payment_form_tender_id ?? "",
    purchaser_name: voucher.purchaser_name,
    recipient_name: voucher.recipient_name,
    notes: voucher.notes,
  };
}

function statusBadgeClass(status: VoucherStatus): string {
  switch (status) {
    case "draft":
      return "bg-sky-100 text-sky-900";
    case "issued":
      return "bg-[#818a40]/15 text-[#3D421F]";
    case "redeemed":
      return "bg-emerald-100 text-emerald-900";
    case "cancelled":
      return "bg-black/5 text-black/55";
    case "expired":
      return "bg-amber-100 text-amber-900";
  }
}

function formatSignedMoney(value: number): string {
  if (value === 0) return formatMoney(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

type FormHost = "page" | "issue-modal" | "redeem-modal";

export function VouchersPanel({
  venueName,
  vouchers,
  tenders,
  tenderTotals,
  canEdit,
}: VouchersPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [workspace, setWorkspace] = useState<WorkspaceTab>("issue");
  const [formOpen, setFormOpen] = useState(false);
  const [formHost, setFormHost] = useState<FormHost>("page");
  const [issueDayModalOpen, setIssueDayModalOpen] = useState(false);
  const [redeemDayModalOpen, setRedeemDayModalOpen] = useState(false);
  const [vouchersCatalogOpen, setVouchersCatalogOpen] = useState(false);
  const [workflowGuideOpen, setWorkflowGuideOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("Voucher details");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedIssueDate, setSelectedIssueDate] = useState<string | null>(
    null,
  );
  const [selectedRedeemDate, setSelectedRedeemDate] = useState<string | null>(
    null,
  );

  const paymentForms = useMemo(() => paymentFormTenders(tenders), [tenders]);
  const tenderNameById = useMemo(
    () => new Map(tenders.map((tender) => [tender.id, tender.name])),
    [tenders],
  );

  const ledger = useMemo(() => summarizeVoucherLedger(vouchers), [vouchers]);
  const reconciliation = useMemo(
    () => reconcileVouchers(ledger, tenderTotals),
    [ledger, tenderTotals],
  );
  const issueDaysAll = useMemo(
    () => buildIssueDayAllocations(tenderTotals, vouchers),
    [tenderTotals, vouchers],
  );
  const issueDays = useMemo(
    () => issueDaysWithVoucherIssueTender(issueDaysAll),
    [issueDaysAll],
  );
  const redeemDaysAll = useMemo(
    () => buildRedeemDayAllocations(tenderTotals, vouchers),
    [tenderTotals, vouchers],
  );
  const redeemDays = useMemo(
    () => redeemDaysWithVoucherRedeemTender(redeemDaysAll),
    [redeemDaysAll],
  );
  const recentIssued = useMemo(
    () => recentIssuedVouchers(vouchers, 6),
    [vouchers],
  );
  const recentRedeemed = useMemo(
    () => recentRedeemedVouchers(vouchers, 6),
    [vouchers],
  );
  const outstanding = useMemo(
    () =>
      vouchers
        .filter((v) => v.status === "issued")
        .slice()
        .sort((a, b) => a.issued_date.localeCompare(b.issued_date)),
    [vouchers],
  );
  const drafts = useMemo(
    () =>
      vouchers
        .filter((v) => v.status === "draft")
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [vouchers],
  );
  const catalogVouchers = useMemo(
    () =>
      vouchers
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [vouchers],
  );

  const selectedIssueDay = useMemo(
    () => issueDays.find((d) => d.sale_date === selectedIssueDate) ?? null,
    [issueDays, selectedIssueDate],
  );
  const selectedRedeemDay = useMemo(
    () => redeemDays.find((d) => d.sale_date === selectedRedeemDate) ?? null,
    [redeemDays, selectedRedeemDate],
  );

  useEffect(() => {
    if (selectedIssueDate) return;
    const unmatched = issueDays.find(
      (d) => !d.balanced && voucherIssueAmount(d) > 0,
    );
    const fallback =
      issueDays.find((d) => voucherIssueAmount(d) > 0) ?? issueDays[0];
    const next = unmatched?.sale_date ?? fallback?.sale_date ?? null;
    if (next) setSelectedIssueDate(next);
  }, [issueDays, selectedIssueDate]);

  function openForm(
    next: FormState,
    title: string,
    host: FormHost = "page",
  ) {
    setForm(next);
    setFormTitle(title);
    setFormHost(host);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setFormHost("page");
    setForm(emptyForm());
  }

  function closeIssueDayModal() {
    setIssueDayModalOpen(false);
    if (formOpen && formHost === "issue-modal") {
      closeForm();
    }
  }

  function closeRedeemDayModal() {
    setRedeemDayModalOpen(false);
    if (formOpen && formHost === "redeem-modal") {
      closeForm();
    }
  }

  function openRedeemDayModal(date: string) {
    setSelectedRedeemDate(date);
    setRedeemDayModalOpen(true);
  }

  function openIssueDayModal(date: string) {
    setSelectedIssueDate(date);
    setIssueDayModalOpen(true);
  }

  function openCreateForIssueDay(day: VoucherDayAllocation) {
    const remaining =
      day.remaining_gs > 0 ? String(day.remaining_gs) : "";
    openForm(
      emptyForm({
        status: "draft",
        issued_date: day.sale_date,
        face_value_gs: remaining,
      }),
      `Create voucher for ${formatDisplayDate(day.sale_date)}`,
      "issue-modal",
    );
  }

  function handleLinkVoucherToIssueDay(
    voucher: VenueVoucher,
    issueDate: string,
  ) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      formData.set("voucher_number", voucher.voucher_number);
      formData.set("voucher_name", voucher.voucher_name);
      formData.set("face_value_gs", String(voucher.face_value_gs));
      formData.set("status", "issued");
      formData.set("issued_date", issueDate);
      formData.set("redeemed_date", voucher.redeemed_date ?? "");
      formData.set("expires_date", voucher.expires_date ?? "");
      formData.set(
        "payment_form_tender_id",
        voucher.payment_form_tender_id ?? "",
      );
      formData.set("purchaser_name", voucher.purchaser_name);
      formData.set("recipient_name", voucher.recipient_name);
      formData.set("notes", voucher.notes);

      const result = await saveVenueVoucher(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher linked to this issue day.");
      router.refresh();
    });
  }

  function handleUnlinkFromIssueDay(
    voucher: VenueVoucher,
    issueDate: string,
  ) {
    if (voucher.status === "redeemed") {
      toast.error(
        "Unlink the redemption first before removing this voucher from the issue day.",
      );
      return;
    }
    if (
      !window.confirm(
        `Unlink ${voucher.voucher_number} from ${formatDisplayDate(issueDate)}? The voucher will stay in your list as a draft.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      formData.set("voucher_number", voucher.voucher_number);
      formData.set("voucher_name", voucher.voucher_name);
      formData.set("face_value_gs", String(voucher.face_value_gs));
      formData.set("status", "draft");
      formData.set("issued_date", formatLocalDate());
      formData.set("redeemed_date", "");
      formData.set("expires_date", voucher.expires_date ?? "");
      formData.set(
        "payment_form_tender_id",
        voucher.payment_form_tender_id ?? "",
      );
      formData.set("purchaser_name", voucher.purchaser_name);
      formData.set("recipient_name", voucher.recipient_name);
      formData.set("notes", voucher.notes);

      const result = await saveVenueVoucher(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher unlinked from this issue day.");
      if (form.id === voucher.id) closeForm();
      router.refresh();
    });
  }

  const linkableToIssueDay = useMemo(() => {
    if (!selectedIssueDay) return [];
    const onDayIds = new Set(selectedIssueDay.vouchers.map((v) => v.id));
    return vouchers
      .filter(
        (v) =>
          (v.status === "draft" || v.status === "issued") &&
          !onDayIds.has(v.id),
      )
      .slice()
      .sort((a, b) => {
        const statusCmp = a.status.localeCompare(b.status);
        if (statusCmp !== 0) return statusCmp;
        return a.voucher_number.localeCompare(b.voucher_number);
      });
  }, [vouchers, selectedIssueDay]);

  function openCreateDraft() {
    openForm(
      emptyForm({ status: "draft", issued_date: formatLocalDate() }),
      "Create voucher",
    );
  }

  function openEdit(voucher: VenueVoucher, host: FormHost = "page") {
    openForm(voucherToForm(voucher), `Edit ${voucher.voucher_number}`, host);
  }

  function openRedeem(
    voucher: VenueVoucher,
    redeemedDate?: string,
    host: FormHost = "page",
  ) {
    openForm(
      {
        ...voucherToForm(voucher),
        status: "redeemed",
        redeemed_date: redeemedDate || formatLocalDate(),
      },
      `Redeem ${voucher.voucher_number}`,
      host,
    );
  }

  function openIssueDraft(voucher: VenueVoucher, issuedDate?: string) {
    openForm(
      {
        ...voucherToForm(voucher),
        status: "issued",
        issued_date: issuedDate || voucher.issued_date || formatLocalDate(),
      },
      `Issue ${voucher.voucher_number}`,
    );
  }

  function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      if (form.id) formData.set("id", form.id);
      formData.set("voucher_number", form.voucher_number);
      formData.set("voucher_name", form.voucher_name);
      formData.set("face_value_gs", form.face_value_gs || "0");
      formData.set("status", form.id ? form.status : "draft");
      formData.set("issued_date", form.issued_date);
      formData.set(
        "redeemed_date",
        form.status === "redeemed"
          ? form.redeemed_date || formatLocalDate()
          : form.redeemed_date,
      );
      formData.set("expires_date", form.expires_date);
      formData.set("payment_form_tender_id", form.payment_form_tender_id);
      formData.set("purchaser_name", form.purchaser_name);
      formData.set("recipient_name", form.recipient_name);
      formData.set("notes", form.notes);

      const result = await saveVenueVoucher(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher saved.");
      if (formHost === "issue-modal" || formHost === "redeem-modal") {
        setFormOpen(false);
        setFormHost("page");
        setForm(emptyForm());
      } else {
        closeForm();
      }
      router.refresh();
    });
  }

  function handleDelete(voucher: VenueVoucher) {
    if (
      !window.confirm(
        `Delete voucher ${voucher.voucher_number}? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      const result = await removeVenueVoucher(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher deleted.");
      if (form.id === voucher.id) closeForm();
      router.refresh();
    });
  }

  function handleQuickRedeem(voucher: VenueVoucher, date?: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      formData.set("redeemed_date", date || formatLocalDate());
      const result = await markVenueVoucherRedeemed(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher redeemed.");
      router.refresh();
    });
  }

  function paymentLabel(tenderId: string | null): string {
    if (!tenderId) return "—";
    return tenderNameById.get(tenderId) ?? "—";
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          label="Outstanding"
          value={formatMoney(ledger.outstanding_gs)}
          hint={`${ledger.outstanding_count} open`}
          emphasis
        />
        <SummaryCard
          label="Drafts"
          value={formatMoney(ledger.draft_gs)}
          hint={`${ledger.draft_count} pending`}
        />
        <SummaryCard
          label="Issued (all time)"
          value={formatMoney(ledger.issued_all_time_gs)}
          hint={`${ledger.issued_all_time_count} vouchers`}
        />
        <SummaryCard
          label="Redeemed"
          value={formatMoney(ledger.redeemed_gs)}
          hint={`${ledger.redeemed_count} used`}
        />
        <SummaryCard
          label="Cancelled"
          value={formatMoney(ledger.cancelled_gs)}
          hint={`${ledger.cancelled_count} voided`}
        />
        <SummaryCard
          label="Expired"
          value={formatMoney(ledger.expired_gs)}
          hint={`${ledger.expired_count} expired`}
        />
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">
            Tender reconciliation
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Daily Sales / Waiter Voucher Issue &amp; Redeem tenders vs detailed
            voucher ledger. Click a day below to split one tender total into
            multiple voucher records.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ReconcilePanel
            label="Voucher Issue"
            salesLabel="Voucher Issue"
            tender={reconciliation.tender_issue_gs}
            ledger={reconciliation.ledger_issued_gs}
            variance={reconciliation.issue_variance_gs}
            emptyLabel="No issued vouchers logged yet."
            rows={recentIssued.map((voucher) => ({
              id: voucher.id,
              primary: formatDisplayDate(voucher.issued_date),
              secondary: voucher.voucher_name || voucher.voucher_number,
              meta: paymentLabel(voucher.payment_form_tender_id),
              value: voucher.face_value_gs,
              onClick: () => openEdit(voucher),
            }))}
          />
          <ReconcilePanel
            label="Voucher Redeem"
            salesLabel="Voucher Redeem"
            tender={reconciliation.tender_redeem_gs}
            ledger={reconciliation.ledger_redeemed_gs}
            variance={reconciliation.redeem_variance_gs}
            emptyLabel="No redemptions logged yet."
            rows={recentRedeemed.map((voucher) => ({
              id: voucher.id,
              primary: formatDisplayDate(voucher.redeemed_date ?? ""),
              secondary: voucher.voucher_name || voucher.voucher_number,
              meta: voucher.voucher_number,
              value: voucher.face_value_gs,
              onClick: () => openEdit(voucher),
            }))}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <VouchersWorkflowGuide
          open={workflowGuideOpen}
          onToggle={() => setWorkflowGuideOpen((value) => !value)}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["issue", "ISSUE from daily tenders"],
                ["redeem", "REDEEM from daily tenders"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setWorkspace(id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  workspace === id
                    ? "bg-[var(--venue-primary,#3D421F)] text-white"
                    : "border border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.03]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-[#3D421F] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          {canEdit || vouchers.length > 0 ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setVouchersCatalogOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-[#3D421F] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
              >
                <Ticket className="h-4 w-4" />
                Vouchers
                {drafts.length > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    {drafts.length}
                  </span>
                ) : null}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => openCreateDraft()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--venue-primary,#3D421F)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Create Voucher
                </button>
              ) : null}
            </>
          ) : null}
          </div>
        </div>

        {workspace === "issue" ? (
          <IssueWorkspace
            days={issueDays}
            issueTotalGs={tenderTotals.issue_gs}
            selectedDate={selectedIssueDate}
            canEdit={canEdit}
            isPending={isPending}
            onOpenDay={openIssueDayModal}
          />
        ) : null}

        {workspace === "redeem" ? (
          <RedeemWorkspace
            days={redeemDays}
            redeemTotalGs={tenderTotals.redeem_gs}
            selectedDate={selectedRedeemDate}
            canEdit={canEdit}
            isPending={isPending}
            onOpenDay={openRedeemDayModal}
          />
        ) : null}
      </Card>

      {exportModalOpen ? (
        <VoucherMonthlyExportModal
          venueName={venueName}
          vouchers={vouchers}
          tenderTotals={tenderTotals}
          tenderNameById={tenderNameById}
          onClose={() => setExportModalOpen(false)}
        />
      ) : null}

      {vouchersCatalogOpen ? (
        <VouchersCatalogModal
          vouchers={catalogVouchers}
          canEdit={canEdit}
          isPending={isPending}
          paymentLabel={paymentLabel}
          onClose={() => setVouchersCatalogOpen(false)}
          onEdit={(voucher) => {
            setVouchersCatalogOpen(false);
            openEdit(voucher);
          }}
          onIssue={(voucher) => {
            setVouchersCatalogOpen(false);
            openIssueDraft(voucher);
          }}
          onDelete={handleDelete}
        />
      ) : null}

      {issueDayModalOpen && selectedIssueDay ? (
        <IssueDayModal
          day={selectedIssueDay}
          linkableVouchers={linkableToIssueDay}
          canEdit={canEdit}
          isPending={isPending}
          paymentLabel={paymentLabel}
          formOpen={formOpen && formHost === "issue-modal"}
          formTitle={formTitle}
          form={form}
          setForm={setForm}
          paymentForms={paymentForms}
          issueDays={issueDaysAll}
          redeemDays={redeemDaysAll}
          onClose={closeIssueDayModal}
          onCreateNew={() => openCreateForIssueDay(selectedIssueDay)}
          onLinkVoucher={(voucher) =>
            handleLinkVoucherToIssueDay(voucher, selectedIssueDay.sale_date)
          }
          onEdit={(voucher) => openEdit(voucher, "issue-modal")}
          onUnlink={(voucher) =>
            handleUnlinkFromIssueDay(voucher, selectedIssueDay.sale_date)
          }
          onCloseForm={closeForm}
          onSave={handleSave}
        />
      ) : null}

      {redeemDayModalOpen && selectedRedeemDay ? (
        <RedeemDayModal
          day={selectedRedeemDay}
          linkableVouchers={outstanding}
          canEdit={canEdit}
          isPending={isPending}
          formOpen={formOpen && formHost === "redeem-modal"}
          formTitle={formTitle}
          form={form}
          setForm={setForm}
          paymentForms={paymentForms}
          issueDays={issueDaysAll}
          redeemDays={redeemDaysAll}
          onClose={closeRedeemDayModal}
          onLinkVoucher={(voucher) =>
            handleQuickRedeem(voucher, selectedRedeemDay.sale_date)
          }
          onEdit={(voucher) => openEdit(voucher, "redeem-modal")}
          onDelete={handleDelete}
          onCloseForm={closeForm}
          onSave={handleSave}
        />
      ) : null}

      {formOpen && formHost === "page" ? (
        <VoucherFormModal
          title={formTitle}
          form={form}
          setForm={setForm}
          canEdit={canEdit}
          isPending={isPending}
          paymentForms={paymentForms}
          issueDays={issueDaysAll}
          redeemDays={redeemDaysAll}
          onClose={closeForm}
          onSave={handleSave}
        />
      ) : null}
    </div>
  );
}

function VoucherFormModal({
  title,
  form,
  setForm,
  canEdit,
  isPending,
  paymentForms,
  issueDays,
  redeemDays,
  onClose,
  onSave,
}: {
  title: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  canEdit: boolean;
  isPending: boolean;
  paymentForms: VenueTender[];
  issueDays: VoucherDayAllocation[];
  redeemDays: VoucherDayAllocation[];
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPending, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!isPending && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voucher-form-modal-title"
        className="flex max-h-[min(90vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <VoucherDetailsFormHeader
              title={title}
              onClose={onClose}
              titleId="voucher-form-modal-title"
            />
            <VoucherDetailsFormFields
              form={form}
              setForm={setForm}
              canEdit={canEdit}
              isPending={isPending}
              paymentForms={paymentForms}
              issueDays={issueDays}
              redeemDays={redeemDays}
            />
            <VoucherDetailsFormActions
              canEdit={canEdit}
              isPending={isPending}
              onCancel={onClose}
              onSave={onSave}
              saveLabel={form.id ? "Save voucher" : "Create Voucher"}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function VouchersWorkflowGuide({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-black/[0.02]"
        aria-expanded={open}
      >
        <span className="font-serif text-base text-[#3D421F]">
          How to create, issue, redeem &amp; link vouchers
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-black/40 transition-transform",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-black/5 px-4 pb-4 pt-3 text-sm leading-relaxed text-black/60">
          <p>
            <span className="font-medium text-[#3D421F]">
              Keep records balanced.
            </span>{" "}
            Daily and waiter sales record lump-sum{" "}
            <span className="font-medium">Voucher Issue</span> and{" "}
            <span className="font-medium">Voucher Redeem</span> tenders. This
            page splits those totals into individual voucher lines. When
            allocated voucher amounts match the tender on each day, variance
            stays at zero in{" "}
            <span className="font-medium">Tender reconciliation</span> above —
            that is how finance and ops stay aligned.
          </p>
          <ol className="list-decimal space-y-3 pl-5 marker:font-medium marker:text-[#3D421F]">
            <li>
              <span className="font-medium text-[#3D421F]">Create</span> — Use{" "}
              <span className="font-medium">Create Voucher</span> or create on
              the spot from an issue day. New records save as{" "}
              <span className="font-medium">drafts</span> in{" "}
              <span className="font-medium">Vouchers</span> until they count
              toward a tender.
            </li>
            <li>
              <span className="font-medium text-[#3D421F]">Issue</span> — Open{" "}
              <span className="font-medium">ISSUE from daily tenders</span>,
              click a day with a Voucher Issue total, then{" "}
              <span className="font-medium">link</span> an existing draft or
              issued voucher or <span className="font-medium">create</span> a new
              one. Face values on that day should sum to the tender; watch{" "}
              <span className="font-medium">Remaining</span> until it reaches
              zero.
            </li>
            <li>
              <span className="font-medium text-[#3D421F]">Redeem</span> — Open{" "}
              <span className="font-medium">REDEEM from daily tenders</span>,
              click a day, and <span className="font-medium">link</span> issued
              vouchers to match the Voucher Redeem tender for that date.
            </li>
            <li>
              <span className="font-medium text-[#3D421F]">Link &amp; unlink</span>{" "}
              — Linking sets issue or redeem dates from the daily tender
              workspace. <span className="font-medium">Unlink</span> on an
              issue day returns a voucher to draft without deleting it. Edit
              details anytime from <span className="font-medium">Vouchers</span>;
              delete only when a record should be removed entirely.
            </li>
          </ol>
          <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-amber-950">
            Days highlighted as needing detail still have tender money without
            enough voucher lines — open them and link or create vouchers until
            each day is balanced.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function IssueWorkspace({
  days,
  issueTotalGs,
  selectedDate,
  canEdit,
  isPending,
  onOpenDay,
}: {
  days: VoucherDayAllocation[];
  issueTotalGs: number;
  selectedDate: string | null;
  canEdit: boolean;
  isPending: boolean;
  onOpenDay: (saleDate: string) => void;
}) {
  const [listFilter, setListFilter] = useState<"all" | "needs_detail">("all");

  const visibleDays = useMemo(() => {
    if (listFilter === "needs_detail") {
      return days.filter((day) => !day.balanced);
    }
    return days;
  }, [days, listFilter]);

  const columnTotals = useMemo(() => {
    let allocatedSum = 0;
    let remainingSum = 0;
    for (const day of days) {
      allocatedSum += day.allocated_gs;
      remainingSum += day.remaining_gs;
    }
    return { allocatedSum, remainingSum };
  }, [days]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-xs text-black/50">
          Click a day to open voucher details. Amounts are Voucher Issue from
          Daily / Waiter sales only — not payment form or total revenue.
        </p>
        <div className="flex rounded-md border border-black/10 bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setListFilter("all")}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              listFilter === "all"
                ? "bg-[var(--venue-primary,#3D421F)] text-white"
                : "text-[#3D421F] hover:bg-black/[0.03]",
            )}
          >
            All days
          </button>
          <button
            type="button"
            onClick={() => setListFilter("needs_detail")}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              listFilter === "needs_detail"
                ? "bg-[var(--venue-primary,#3D421F)] text-white"
                : "text-[#3D421F] hover:bg-black/[0.03]",
            )}
          >
            Needs detail
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium text-right">Voucher Issue</th>
              <th className="px-3 py-2 font-medium text-right">Allocated</th>
              <th className="px-3 py-2 font-medium text-right">Remaining</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleDays.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-black/45">
                  {listFilter === "needs_detail"
                    ? "All Voucher Issue days are matched to the ledger."
                    : "No Voucher Issue tender amounts yet. Enter them on Daily / Waiter sales first."}
                </td>
              </tr>
            ) : (
              visibleDays.map((day) => {
                const issueGs = voucherIssueAmount(day);
                return (
                  <tr
                    key={day.sale_date}
                    className={cn(
                      "cursor-pointer border-t border-black/5 hover:bg-black/[0.02]",
                      selectedDate === day.sale_date && "bg-[#818a40]/08",
                    )}
                    onClick={() => onOpenDay(day.sale_date)}
                  >
                    <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                      {formatDisplayDate(day.sale_date)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(issueGs)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(day.allocated_gs)}
                      <span className="ml-1 text-xs text-black/40">
                        ({day.voucher_count})
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums font-medium",
                        day.balanced ? "text-emerald-700" : "text-amber-800",
                      )}
                    >
                      {formatMoney(day.remaining_gs)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          day.balanced
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900",
                        )}
                      >
                        {day.balanced ? "Matched" : "Needs detail"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {days.length > 0 ? (
            <tfoot className="border-t border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <td className="px-3 py-2.5 font-medium">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#3D421F]">
                  {formatMoney(issueTotalGs)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#3D421F]">
                  {formatMoney(columnTotals.allocatedSum)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-amber-900">
                  {formatMoney(columnTotals.remainingSum)}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function IssueDayModal({
  day,
  linkableVouchers,
  canEdit,
  isPending,
  paymentLabel,
  formOpen,
  formTitle,
  form,
  setForm,
  paymentForms,
  issueDays,
  redeemDays,
  onClose,
  onCreateNew,
  onLinkVoucher,
  onEdit,
  onUnlink,
  onCloseForm,
  onSave,
}: {
  day: VoucherDayAllocation;
  linkableVouchers: VenueVoucher[];
  canEdit: boolean;
  isPending: boolean;
  paymentLabel: (id: string | null) => string;
  formOpen: boolean;
  formTitle: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  paymentForms: VenueTender[];
  issueDays: VoucherDayAllocation[];
  redeemDays: VoucherDayAllocation[];
  onClose: () => void;
  onCreateNew: () => void;
  onLinkVoucher: (voucher: VenueVoucher) => void;
  onEdit: (voucher: VenueVoucher) => void;
  onUnlink: (voucher: VenueVoucher) => void;
  onCloseForm: () => void;
  onSave: () => void;
}) {
  const [selectedVoucherId, setSelectedVoucherId] = useState("");

  useEffect(() => {
    setSelectedVoucherId("");
  }, [day.sale_date]);

  const selectedVoucher = useMemo(
    () => linkableVouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [linkableVouchers, selectedVoucherId],
  );

  const canLinkMore = day.remaining_gs > 0.005;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        if (formOpen) {
          onCloseForm();
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formOpen, isPending, onClose, onCloseForm]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!isPending && event.target === event.currentTarget) {
          if (formOpen) onCloseForm();
          else onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-day-modal-title"
        className="flex max-h-[min(90vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="issue-day-modal-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {formatDisplayDate(day.sale_date)}
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Voucher Issue{" "}
              {formatMoney(day.issue_gs ?? voucherIssueAmount(day))} · Allocated{" "}
              {formatMoney(day.allocated_gs)} · Remaining{" "}
              <span
                className={cn(
                  "font-medium",
                  day.balanced ? "text-emerald-700" : "text-amber-800",
                )}
              >
                {formatMoney(day.remaining_gs)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => (formOpen ? onCloseForm() : onClose())}
            disabled={isPending}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {formOpen ? (
            <div className="space-y-4">
              <VoucherDetailsFormHeader
                title={formTitle}
                onClose={onCloseForm}
                compact
              />
              <VoucherDetailsFormFields
                form={form}
                setForm={setForm}
                canEdit={canEdit}
                isPending={isPending}
                paymentForms={paymentForms}
                issueDays={issueDays}
                redeemDays={redeemDays}
                highlightIssueDate={day.sale_date}
              />
              <VoucherDetailsFormActions
                canEdit={canEdit}
                isPending={isPending}
                onCancel={onCloseForm}
                onSave={onSave}
                saveLabel={form.id ? "Save voucher" : "Create Voucher"}
              />
            </div>
          ) : (
            <div className="space-y-5">
              {canLinkMore && canEdit ? (
                <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                  <div>
                    <p className="text-sm font-medium text-[#3D421F]">
                      Link to a previous issued voucher
                    </p>
                    <p className="mt-1 text-sm text-black/55">
                      Select a draft or an issued voucher to allocate toward
                      this day&apos;s Voucher Issue tender (
                      {formatMoney(day.remaining_gs)} still to allocate).
                    </p>
                  </div>
                  {linkableVouchers.length === 0 ? (
                    <p className="rounded-md border border-dashed border-black/15 px-3 py-4 text-sm text-black/45">
                      No vouchers available to link. Create one below or from
                      the toolbar.
                    </p>
                  ) : (
                    <>
                      <Field label="Voucher">
                        <select
                          className={inputClass}
                          disabled={!canEdit || isPending}
                          value={selectedVoucherId}
                          onChange={(e) =>
                            setSelectedVoucherId(e.target.value)
                          }
                        >
                          <option value="">Select voucher…</option>
                          {linkableVouchers.map((voucher) => (
                            <option key={voucher.id} value={voucher.id}>
                              {voucher.status === "draft"
                                ? "[Draft] "
                                : ""}
                              {voucher.voucher_number}
                              {voucher.voucher_name
                                ? ` · ${voucher.voucher_name}`
                                : ""}{" "}
                              · {formatMoney(voucher.face_value_gs)}
                              {voucher.status === "issued" &&
                              voucher.issued_date
                                ? ` · issued ${formatDisplayDate(voucher.issued_date)}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {selectedVoucher ? (
                        <p className="text-xs text-black/50">
                          Issue date will be set to{" "}
                          {formatDisplayDate(day.sale_date)} and status to
                          issued.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={
                            isPending || !selectedVoucher || !selectedVoucherId
                          }
                          onClick={() => {
                            if (selectedVoucher) {
                              onLinkVoucher(selectedVoucher);
                              setSelectedVoucherId("");
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--venue-primary,#3D421F)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Link to this day
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {canEdit ? (
                <div className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                  <div>
                    <p className="text-sm font-medium text-[#3D421F]">
                      Create a voucher on the spot
                    </p>
                    <p className="mt-1 text-sm text-black/55">
                      Opens a form to save a draft; issue it from Drafts or link
                      it here once ready.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={onCreateNew}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--venue-primary,#3D421F)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--venue-primary,#3D421F)] disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      Create new voucher
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-black/45">
                  Linked to this issue day
                </p>
              {day.vouchers.length === 0 ? (
                <p className="rounded-md border border-dashed border-black/15 px-3 py-8 text-center text-sm text-black/45">
                  No voucher details for this day yet.
                </p>
              ) : (
                <ul className="divide-y divide-black/5 rounded-md border border-black/10">
                  {day.vouchers.map((voucher) => (
                    <li
                      key={voucher.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[#3D421F]">
                            {voucher.voucher_number}
                          </span>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                              statusBadgeClass(voucher.status),
                            )}
                          >
                            {VOUCHER_STATUS_LABELS[voucher.status]}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-black/50">
                          {voucher.voucher_name || "Unnamed"} · Paid via{" "}
                          {paymentLabel(voucher.payment_form_tender_id)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-medium text-[#3D421F]">
                          {formatMoney(voucher.face_value_gs)}
                        </span>
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              title="Edit"
                              disabled={isPending}
                              onClick={() => onEdit(voucher)}
                              className="rounded-md p-1.5 text-[#3D421F] hover:bg-black/[0.04] disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title={
                                voucher.status === "redeemed"
                                  ? "Cannot unlink — voucher is redeemed"
                                  : "Unlink voucher"
                              }
                              disabled={
                                isPending || voucher.status === "redeemed"
                              }
                              onClick={() => onUnlink(voucher)}
                              className="rounded-md p-1.5 text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                            >
                              <Unlink className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function VoucherDetailsFormHeader({
  title,
  onClose,
  compact = false,
  titleId,
}: {
  title: string;
  onClose: () => void;
  compact?: boolean;
  titleId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3
          id={titleId}
          className={cn(
            "font-serif text-[#3D421F]",
            compact ? "text-lg" : "text-xl",
          )}
        >
          {title}
        </h3>
        <p className="mt-1 text-sm text-black/55">
          Record keeping for issued vouchers and redeem tracking. One daily
          tender total can be split across multiple voucher entries.
        </p>
      </div>
      {compact ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F]"
          aria-label="Back to list"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F]"
          aria-label="Close form"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function VoucherDailyTenderLinks({
  form,
  issueDays,
  redeemDays,
  highlightIssueDate,
  highlightRedeemDate,
}: {
  form: FormState;
  issueDays: VoucherDayAllocation[];
  redeemDays: VoucherDayAllocation[];
  highlightIssueDate?: string;
  highlightRedeemDate?: string;
}) {
  const faceValue = Number(form.face_value_gs) || 0;
  const issueDay =
    form.issued_date && form.status !== "draft" && form.status !== "cancelled"
      ? (issueDays.find((d) => d.sale_date === form.issued_date) ?? null)
      : null;
  const redeemDay =
    form.redeemed_date && form.status === "redeemed"
      ? (redeemDays.find((d) => d.sale_date === form.redeemed_date) ?? null)
      : null;

  if (form.status === "draft") {
    return (
      <div className="rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-4 py-3 text-sm text-black/55">
        <p className="font-medium text-[#3D421F]">Daily tender links</p>
        <p className="mt-1">
          Not linked yet. Assign from{" "}
          <span className="font-medium">ISSUE from daily tenders</span>, use{" "}
          <span className="font-medium">Issue</span> in the Vouchers list, or
          save and link when the tender is recorded.
          {form.issued_date ? (
            <>
              {" "}
              Planned issue date: {formatDisplayDate(form.issued_date)}.
            </>
          ) : null}
        </p>
      </div>
    );
  }

  if (form.status === "cancelled") {
    return (
      <div className="rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 text-sm text-black/55">
        <p className="font-medium text-[#3D421F]">Daily tender links</p>
        <p className="mt-1">Cancelled — excluded from tender reconciliation.</p>
      </div>
    );
  }

  const showIssue =
    form.status === "issued" ||
    form.status === "redeemed" ||
    form.status === "expired";

  if (!showIssue && !redeemDay) return null;

  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3">
      <p className="text-sm font-medium text-[#3D421F]">Daily tender links</p>
      <ul className="space-y-2 text-sm text-black/60">
        {showIssue && form.issued_date ? (
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-[#3D421F]">Voucher Issue</span>
            <span>·</span>
            <span>{formatDisplayDate(form.issued_date)}</span>
            {highlightIssueDate === form.issued_date ? (
              <span className="rounded-full bg-[var(--venue-primary,#3D421F)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--venue-primary,#3D421F)]">
                This issue day
              </span>
            ) : null}
            {issueDay ? (
              <span className="text-black/50">
                · Daily tender {formatMoney(voucherIssueAmount(issueDay))} · This
                voucher {formatMoney(faceValue)}
                {issueDay.balanced ? (
                  <span className="text-emerald-700"> · Day balanced</span>
                ) : (
                  <span className="text-amber-800">
                    {" "}
                    · {formatMoney(issueDay.remaining_gs)} unallocated on day
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-800">
                · No Voucher Issue tender on daily sales for this date
              </span>
            )}
          </li>
        ) : null}
        {form.status === "redeemed" && form.redeemed_date ? (
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-[#3D421F]">Voucher Redeem</span>
            <span>·</span>
            <span>{formatDisplayDate(form.redeemed_date)}</span>
            {highlightRedeemDate === form.redeemed_date ? (
              <span className="rounded-full bg-[var(--venue-primary,#3D421F)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--venue-primary,#3D421F)]">
                This redeem day
              </span>
            ) : null}
            {redeemDay ? (
              <span className="text-black/50">
                · Daily tender {formatMoney(voucherRedeemAmount(redeemDay))} ·
                This voucher {formatMoney(faceValue)}
                {redeemDay.balanced ? (
                  <span className="text-emerald-700"> · Day balanced</span>
                ) : (
                  <span className="text-amber-800">
                    {" "}
                    · {formatMoney(redeemDay.remaining_gs)} unallocated on day
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-800">
                · No Voucher Redeem tender on daily sales for this date
              </span>
            )}
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-black/45">
        Issue and redeem dates are set when you link from the daily tender
        workspaces — not editable here.
      </p>
    </div>
  );
}

function VoucherDetailsFormFields({
  form,
  setForm,
  canEdit,
  isPending,
  paymentForms,
  issueDays,
  redeemDays,
  highlightIssueDate,
  highlightRedeemDate,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  canEdit: boolean;
  isPending: boolean;
  paymentForms: VenueTender[];
  issueDays: VoucherDayAllocation[];
  redeemDays: VoucherDayAllocation[];
  highlightIssueDate?: string;
  highlightRedeemDate?: string;
}) {
  const datesLocked =
    form.status === "issued" ||
    form.status === "redeemed" ||
    form.status === "expired";

  return (
    <>
      <VoucherDailyTenderLinks
        form={form}
        issueDays={issueDays}
        redeemDays={redeemDays}
        highlightIssueDate={highlightIssueDate}
        highlightRedeemDate={highlightRedeemDate}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Voucher number *">
          <input
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.voucher_number}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                voucher_number: e.target.value,
              }))
            }
            placeholder="e.g. GV-1042"
          />
        </Field>
        <Field label="Voucher name">
          <input
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.voucher_name}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                voucher_name: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Face value *">
          <input
            className={inputClass}
            inputMode="decimal"
            disabled={!canEdit || isPending}
            value={form.face_value_gs}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                face_value_gs: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Status">
          <div className="mt-1 flex min-h-10 flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                statusBadgeClass(form.status),
              )}
            >
              {VOUCHER_STATUS_LABELS[form.status]}
            </span>
            <span className="text-xs text-black/45">
              Updated automatically when linked to daily tenders
            </span>
          </div>
        </Field>
        <DateField label={datesLocked ? "Issued date" : "Issued date *"}>
          <SalesDateInput
            className={dateFieldClass}
            inputClassName={dateFieldInputClass}
            disabled={!canEdit || isPending || datesLocked}
            value={form.issued_date}
            onChange={(issued_date) =>
              setForm((prev) => ({ ...prev, issued_date }))
            }
          />
        </DateField>
        <DateField label="Expires">
          <SalesDateInput
            className={dateFieldClass}
            inputClassName={dateFieldInputClass}
            disabled={!canEdit || isPending}
            value={form.expires_date}
            onChange={(expires_date) =>
              setForm((prev) => ({ ...prev, expires_date }))
            }
          />
        </DateField>
        <Field label="Payment Form">
          <select
            className={inputClass}
            disabled={!canEdit || isPending || paymentForms.length === 0}
            value={form.payment_form_tender_id}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                payment_form_tender_id: e.target.value,
              }))
            }
          >
            <option value="">
              {paymentForms.length === 0
                ? "No payment tenders configured"
                : "Select payment form…"}
            </option>
            {paymentForms.map((tender) => (
              <option key={tender.id} value={tender.id}>
                {tender.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purchaser Name">
          <input
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.purchaser_name}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                purchaser_name: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Recipient Name">
          <input
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.recipient_name}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                recipient_name: e.target.value,
              }))
            }
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          className={textareaClass}
          rows={3}
          disabled={!canEdit || isPending}
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
        />
      </Field>
    </>
  );
}

function VoucherDetailsFormActions({
  canEdit,
  isPending,
  onCancel,
  onSave,
  saveLabel = "Save voucher",
}: {
  canEdit: boolean;
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm text-[#3D421F] hover:bg-black/[0.03]"
      >
        Cancel
      </button>
      {canEdit ? (
        <button
          type="button"
          disabled={isPending}
          onClick={onSave}
          className="rounded-md bg-[var(--venue-primary,#3D421F)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveLabel}
        </button>
      ) : null}
    </div>
  );
}

function RedeemWorkspace({
  days,
  redeemTotalGs,
  selectedDate,
  onOpenDay,
}: {
  days: VoucherDayAllocation[];
  redeemTotalGs: number;
  selectedDate: string | null;
  canEdit: boolean;
  isPending: boolean;
  onOpenDay: (saleDate: string) => void;
}) {
  const [listFilter, setListFilter] = useState<"all" | "needs_detail">("all");

  const visibleDays = useMemo(() => {
    if (listFilter === "needs_detail") {
      return days.filter((day) => !day.balanced);
    }
    return days;
  }, [days, listFilter]);

  const columnTotals = useMemo(() => {
    let allocatedSum = 0;
    let remainingSum = 0;
    for (const day of days) {
      allocatedSum += day.allocated_gs;
      remainingSum += day.remaining_gs;
    }
    return { allocatedSum, remainingSum };
  }, [days]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-xs text-black/50">
          Click a day to open redeem details. Amounts are Voucher Redeem from
          Daily / Waiter sales only — not payment form or total revenue.
        </p>
        <div className="flex rounded-md border border-black/10 bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setListFilter("all")}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              listFilter === "all"
                ? "bg-[var(--venue-primary,#3D421F)] text-white"
                : "text-[#3D421F] hover:bg-black/[0.03]",
            )}
          >
            All days
          </button>
          <button
            type="button"
            onClick={() => setListFilter("needs_detail")}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              listFilter === "needs_detail"
                ? "bg-[var(--venue-primary,#3D421F)] text-white"
                : "text-[#3D421F] hover:bg-black/[0.03]",
            )}
          >
            Needs detail
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium text-right">
                Voucher Redeem
              </th>
              <th className="px-3 py-2 font-medium text-right">Allocated</th>
              <th className="px-3 py-2 font-medium text-right">Remaining</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleDays.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-black/45">
                  {listFilter === "needs_detail"
                    ? "All Voucher Redeem days are matched to the ledger."
                    : "No Voucher Redeem tender amounts yet. Enter them on Daily / Waiter sales first."}
                </td>
              </tr>
            ) : (
              visibleDays.map((day) => {
                const redeemGs = voucherRedeemAmount(day);
                return (
                  <tr
                    key={day.sale_date}
                    className={cn(
                      "cursor-pointer border-t border-black/5 hover:bg-black/[0.02]",
                      selectedDate === day.sale_date && "bg-[#818a40]/08",
                    )}
                    onClick={() => onOpenDay(day.sale_date)}
                  >
                    <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                      {formatDisplayDate(day.sale_date)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(redeemGs)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(day.allocated_gs)}
                      <span className="ml-1 text-xs text-black/40">
                        ({day.voucher_count})
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums font-medium",
                        day.balanced ? "text-emerald-700" : "text-amber-800",
                      )}
                    >
                      {formatMoney(day.remaining_gs)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          day.balanced
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900",
                        )}
                      >
                        {day.balanced ? "Matched" : "Needs detail"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {days.length > 0 ? (
            <tfoot className="border-t border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <td className="px-3 py-2.5 font-medium">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#3D421F]">
                  {formatMoney(redeemTotalGs)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#3D421F]">
                  {formatMoney(columnTotals.allocatedSum)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-amber-900">
                  {formatMoney(columnTotals.remainingSum)}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function RedeemDayModal({
  day,
  linkableVouchers,
  canEdit,
  isPending,
  formOpen,
  formTitle,
  form,
  setForm,
  paymentForms,
  issueDays,
  redeemDays,
  onClose,
  onLinkVoucher,
  onEdit,
  onDelete,
  onCloseForm,
  onSave,
}: {
  day: VoucherDayAllocation;
  linkableVouchers: VenueVoucher[];
  canEdit: boolean;
  isPending: boolean;
  formOpen: boolean;
  formTitle: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  paymentForms: VenueTender[];
  issueDays: VoucherDayAllocation[];
  redeemDays: VoucherDayAllocation[];
  onClose: () => void;
  onLinkVoucher: (voucher: VenueVoucher) => void;
  onEdit: (voucher: VenueVoucher) => void;
  onDelete: (voucher: VenueVoucher) => void;
  onCloseForm: () => void;
  onSave: () => void;
}) {
  const [selectedVoucherId, setSelectedVoucherId] = useState("");

  useEffect(() => {
    setSelectedVoucherId("");
  }, [day.sale_date]);

  const selectedVoucher = useMemo(
    () => linkableVouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [linkableVouchers, selectedVoucherId],
  );

  const linkedIds = useMemo(
    () => new Set(day.vouchers.map((v) => v.id)),
    [day.vouchers],
  );

  const selectableVouchers = useMemo(
    () => linkableVouchers.filter((v) => !linkedIds.has(v.id)),
    [linkableVouchers, linkedIds],
  );

  const canLinkMore = day.remaining_gs > 0.005;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        if (formOpen) {
          onCloseForm();
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formOpen, isPending, onClose, onCloseForm]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!isPending && event.target === event.currentTarget) {
          if (formOpen) onCloseForm();
          else onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="redeem-day-modal-title"
        className="flex max-h-[min(90vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="redeem-day-modal-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {formatDisplayDate(day.sale_date)}
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Voucher Redeem{" "}
              {formatMoney(day.redeem_gs ?? voucherRedeemAmount(day))} ·
              Allocated {formatMoney(day.allocated_gs)} · Remaining{" "}
              <span
                className={cn(
                  "font-medium",
                  day.balanced ? "text-emerald-700" : "text-amber-800",
                )}
              >
                {formatMoney(day.remaining_gs)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => (formOpen ? onCloseForm() : onClose())}
            disabled={isPending}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {formOpen ? (
            <div className="space-y-4">
              <VoucherDetailsFormHeader
                title={formTitle}
                onClose={onCloseForm}
                compact
              />
              <VoucherDetailsFormFields
                form={form}
                setForm={setForm}
                canEdit={canEdit}
                isPending={isPending}
                paymentForms={paymentForms}
                issueDays={issueDays}
                redeemDays={redeemDays}
                highlightRedeemDate={day.sale_date}
              />
              <VoucherDetailsFormActions
                canEdit={canEdit}
                isPending={isPending}
                onCancel={onCloseForm}
                onSave={onSave}
                saveLabel={form.id ? "Save voucher" : "Create Voucher"}
              />
            </div>
          ) : (
            <div className="space-y-5">
              {canLinkMore ? (
                <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                  <div>
                    <p className="text-sm font-medium text-[#3D421F]">
                      Link issued voucher
                    </p>
                    <p className="mt-1 text-sm text-black/55">
                      Choose a previously issued voucher to count toward this
                      day&apos;s Voucher Redeem tender (
                      {formatMoney(day.remaining_gs)} still to allocate).
                    </p>
                  </div>
                  {selectableVouchers.length === 0 ? (
                    <p className="rounded-md border border-dashed border-black/15 px-3 py-4 text-sm text-black/45">
                      {linkableVouchers.length === 0
                        ? "No issued vouchers available. Create and issue vouchers under Issue from daily tenders first."
                        : "All issued vouchers are already linked for this day, or none are left to redeem."}
                    </p>
                  ) : (
                    <>
                      <Field label="Issued voucher">
                        <select
                          className={inputClass}
                          disabled={!canEdit || isPending}
                          value={selectedVoucherId}
                          onChange={(e) =>
                            setSelectedVoucherId(e.target.value)
                          }
                        >
                          <option value="">Select issued voucher…</option>
                          {selectableVouchers.map((voucher) => (
                            <option key={voucher.id} value={voucher.id}>
                              {voucher.voucher_number}
                              {voucher.voucher_name
                                ? ` · ${voucher.voucher_name}`
                                : ""}{" "}
                              · {formatMoney(voucher.face_value_gs)} · issued{" "}
                              {formatDisplayDate(voucher.issued_date)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {selectedVoucher ? (
                        <p className="text-xs text-black/50">
                          Redeem date will be set to{" "}
                          {formatDisplayDate(day.sale_date)}.
                        </p>
                      ) : null}
                      {canEdit ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={
                              isPending || !selectedVoucher || !selectedVoucherId
                            }
                            onClick={() => {
                              if (selectedVoucher) {
                                onLinkVoucher(selectedVoucher);
                                setSelectedVoucherId("");
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--venue-primary,#3D421F)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Link redemption
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <p className="rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-3 text-sm text-emerald-900">
                  This day&apos;s Voucher Redeem tender is fully allocated to
                  voucher details.
                </p>
              )}

              {day.vouchers.length > 0 ? (
                <div className="border-t border-black/10 pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                    Linked to this redeem day
                  </p>
                  <ul className="mt-2 divide-y divide-black/5 rounded-md border border-black/10">
                    {day.vouchers.map((voucher) => (
                      <li
                        key={voucher.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[#3D421F]">
                              {voucher.voucher_number}
                            </span>
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                                statusBadgeClass(voucher.status),
                              )}
                            >
                              {VOUCHER_STATUS_LABELS[voucher.status]}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-black/50">
                            {voucher.voucher_name || "Unnamed"}
                            {voucher.redeemed_date
                              ? ` · Redeemed ${formatDisplayDate(voucher.redeemed_date)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums font-medium text-[#3D421F]">
                            {formatMoney(voucher.face_value_gs)}
                          </span>
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                title="Edit"
                                disabled={isPending}
                                onClick={() => onEdit(voucher)}
                                className="rounded-md p-1.5 text-[#3D421F] hover:bg-black/[0.04] disabled:opacity-50"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                title="Delete"
                                disabled={isPending}
                                onClick={() => onDelete(voucher)}
                                className="rounded-md p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function VoucherMonthlyExportModal({
  venueName,
  vouchers,
  tenderTotals,
  tenderNameById,
  onClose,
}: {
  venueName: string;
  vouchers: VenueVoucher[];
  tenderTotals: VoucherTenderTotals;
  tenderNameById: Map<string, string>;
  onClose: () => void;
}) {
  const availableMonths = useMemo(
    () => listAvailableExportMonths(vouchers, tenderTotals),
    [vouchers, tenderTotals],
  );
  const [month, setMonth] = useState(() =>
    defaultExportMonth(availableMonths),
  );

  useEffect(() => {
    if (availableMonths.length === 0) return;
    if (!availableMonths.includes(month)) {
      setMonth(defaultExportMonth(availableMonths));
    }
  }, [availableMonths, month]);

  const preview = useMemo(
    () => summarizeMonthForExport(vouchers, tenderTotals, month),
    [vouchers, tenderTotals, month],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleExport() {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const csv = buildMonthlyVoucherExportCsv({
      venueName,
      month,
      vouchers,
      tenderTotals,
      tenderNameById,
    });
    downloadTextFile(csv, voucherExportFilename(venueName, month));
    onClose();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voucher-export-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="voucher-export-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Export monthly vouchers
            </h2>
            <p className="mt-1 text-sm text-black/55">
              CSV for finance: POS Voucher Issue/Redeem vs ledger, payment
              form (how the guest paid), issue and redeem dates.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Calendar month">
            <input
              type="month"
              className={inputClass}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>

          <dl className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">Voucher rows in file</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {preview.voucher_row_count}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">Issue variance (month)</dt>
              <dd
                className={cn(
                  "tabular-nums font-medium",
                  Math.abs(preview.issue_variance_gs) < 0.005
                    ? "text-emerald-700"
                    : "text-amber-800",
                )}
              >
                {formatSignedMoney(preview.issue_variance_gs)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">Redeem variance (month)</dt>
              <dd
                className={cn(
                  "tabular-nums font-medium",
                  Math.abs(preview.redeem_variance_gs) < 0.005
                    ? "text-emerald-700"
                    : "text-amber-800",
                )}
              >
                {formatSignedMoney(preview.redeem_variance_gs)}
              </dd>
            </div>
          </dl>

          <p className="text-xs leading-relaxed text-black/50">
            Includes vouchers with an issue date, redemption date, or draft
            created in this month. Payment form is the tender used when the
            voucher was sold (cash, card, transfer)—not the POS Voucher
            Issue/Redeem lines. Detail rows include same-day POS tender totals
            for reconciliation with daily sales.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-black/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--venue-primary,#3D421F)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function VouchersCatalogModal({
  vouchers,
  canEdit,
  isPending,
  paymentLabel,
  onClose,
  onEdit,
  onIssue,
  onDelete,
}: {
  vouchers: VenueVoucher[];
  canEdit: boolean;
  isPending: boolean;
  paymentLabel: (id: string | null) => string;
  onClose: () => void;
  onEdit: (voucher: VenueVoucher) => void;
  onIssue: (voucher: VenueVoucher) => void;
  onDelete: (voucher: VenueVoucher) => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPending, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!isPending && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vouchers-catalog-title"
        className="flex max-h-[min(90vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="vouchers-catalog-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Vouchers
            </h2>
            <p className="mt-1 text-sm text-black/55">
              All voucher records for this venue. Drafts can be promoted to
              issued when tied to a daily Voucher Issue tender.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {vouchers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-black/15 px-4 py-10 text-center">
              <Ticket className="mx-auto h-8 w-8 text-black/25" />
              <p className="mt-2 text-sm text-black/50">No vouchers yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Number</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Value</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((voucher) => (
                    <tr key={voucher.id} className="border-t border-black/5">
                      <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                        {voucher.voucher_number}
                      </td>
                      <td className="px-3 py-2.5">
                        {voucher.voucher_name || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                            statusBadgeClass(voucher.status),
                          )}
                        >
                          {VOUCHER_STATUS_LABELS[voucher.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(voucher.face_value_gs)}
                      </td>
                      <td className="px-3 py-2.5">
                        {paymentLabel(voucher.payment_form_tender_id)}
                      </td>
                      <td className="px-3 py-2.5">
                        {canEdit ? (
                          <div className="flex justify-end gap-1">
                            {voucher.status === "draft" ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => onIssue(voucher)}
                                className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
                              >
                                Issue
                              </button>
                            ) : null}
                            <button
                              type="button"
                              title="Edit"
                              disabled={isPending}
                              onClick={() => onEdit(voucher)}
                              className="rounded-md p-1.5 text-[#3D421F] hover:bg-black/[0.04] disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              disabled={isPending}
                              onClick={() => onDelete(voucher)}
                              className="rounded-md p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SummaryCard({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-4",
        emphasis && "border-[#818a40]/25 bg-[#818a40]/08",
      )}
    >
      <p className="text-xs uppercase tracking-wide text-black/45">{label}</p>
      <p className="mt-1 font-serif text-2xl tabular-nums text-[#3D421F]">
        {value}
      </p>
      <p className="mt-1 text-xs text-black/45">{hint}</p>
    </Card>
  );
}

function ReconcilePanel({
  label,
  salesLabel,
  tender,
  ledger,
  variance,
  rows,
  emptyLabel,
}: {
  label: string;
  salesLabel: string;
  tender: number;
  ledger: number;
  variance: number;
  rows: Array<{
    id: string;
    primary: string;
    secondary: string;
    meta: string;
    value: number;
    onClick: () => void;
  }>;
  emptyLabel: string;
}) {
  const balanced = Math.abs(variance) < 0.005;
  const [recentOpen, setRecentOpen] = useState(false);

  return (
    <div className="rounded-lg border border-black/10 bg-white/70 p-4">
      <p className="text-sm font-medium text-[#3D421F]">{label}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-black/50">{salesLabel}</dt>
          <dd className="tabular-nums">{formatMoney(tender)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black/50">Ledger</dt>
          <dd className="tabular-nums">{formatMoney(ledger)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-black/5 pt-1.5">
          <dt className="text-black/50">Variance</dt>
          <dd
            className={cn(
              "tabular-nums font-medium",
              balanced ? "text-emerald-700" : "text-amber-800",
            )}
          >
            {formatSignedMoney(variance)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-black/5 pt-3">
        <button
          type="button"
          onClick={() => setRecentOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left hover:bg-black/[0.02]"
          aria-expanded={recentOpen}
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
            Recent
            {rows.length > 0 ? (
              <span className="ml-1.5 font-normal normal-case text-black/35">
                ({rows.length})
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-black/40 transition-transform",
              !recentOpen && "-rotate-90",
            )}
            aria-hidden
          />
        </button>
        {recentOpen ? (
          rows.length === 0 ? (
            <p className="mt-2 text-xs text-black/40">{emptyLabel}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={row.onClick}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-black/[0.03]"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-[#3D421F]">
                        {row.primary}
                      </span>
                      <span className="mt-0.5 block truncate text-black/45">
                        {row.secondary}
                        {row.meta ? ` · ${row.meta}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[#3D421F]">
                      {formatMoney(row.value)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-[#3D421F]">{label}</span>
      {children}
    </label>
  );
}

function DateField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block text-sm">
      <span className="font-medium text-[#3D421F]">{label}</span>
      {children}
    </div>
  );
}
