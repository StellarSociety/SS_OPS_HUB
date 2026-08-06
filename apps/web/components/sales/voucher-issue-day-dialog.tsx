"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Pencil,
  Plus,
  Ticket,
  Unlink,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { saveVenueVoucher } from "@/lib/actions/sales";
import { formatDisplayDate } from "@/lib/dates/display";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import { paymentFormTenders } from "@/lib/sales/tenders-calculations";
import type { VenueTender } from "@/lib/sales/tenders-types";
import {
  buildIssueDayAllocationForDate,
  formatLocalDate,
  voucherIssueAmount,
} from "@/lib/sales/vouchers-calculations";
import type { VenueVoucher, VoucherStatus } from "@/lib/sales/vouchers-types";
import { VOUCHER_STATUS_LABELS } from "@/lib/sales/vouchers-types";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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

const textareaClass =
  "mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[#3D421F]/35 disabled:opacity-60";

function emptyForm(overrides: Partial<FormState> = {}): FormState {
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
    face_value_gs: String(voucher.face_value_gs || ""),
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
      return "bg-black/5 text-black/60";
    case "issued":
      return "bg-sky-100 text-sky-800";
    case "redeemed":
      return "bg-emerald-100 text-emerald-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    case "expired":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-black/5 text-black/60";
  }
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

type VoucherIssueDayDialogProps = {
  open: boolean;
  onClose: () => void;
  saleDate: string;
  issueAmountGs: number;
  vouchers: VenueVoucher[];
  tenders: VenueTender[];
  canEdit: boolean;
};

export function VoucherIssueDayDialog({
  open,
  onClose,
  saleDate,
  issueAmountGs,
  vouchers,
  tenders,
  canEdit,
}: VoucherIssueDayDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("Create voucher");
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [selectedVoucherId, setSelectedVoucherId] = useState("");

  const paymentForms = useMemo(() => paymentFormTenders(tenders), [tenders]);

  const paymentLabel = useMemo(() => {
    const map = new Map(tenders.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [tenders]);

  const day = useMemo(
    () => buildIssueDayAllocationForDate(saleDate, issueAmountGs, vouchers),
    [saleDate, issueAmountGs, vouchers],
  );

  const linkableVouchers = useMemo(() => {
    const onDayIds = new Set(day.vouchers.map((v) => v.id));
    return vouchers
      .filter(
        (v) =>
          (v.status === "draft" || v.status === "issued") && !onDayIds.has(v.id),
      )
      .slice()
      .sort((a, b) => {
        const statusCmp = a.status.localeCompare(b.status);
        if (statusCmp !== 0) return statusCmp;
        return a.voucher_number.localeCompare(b.voucher_number);
      });
  }, [vouchers, day.vouchers]);

  const selectedVoucher = useMemo(
    () => linkableVouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [linkableVouchers, selectedVoucherId],
  );

  const canLinkMore = day.remaining_gs > 0.005;

  useEffect(() => {
    if (!open) {
      setFormOpen(false);
      setSelectedVoucherId("");
      setForm(emptyForm());
    }
  }, [open]);

  useEffect(() => {
    setSelectedVoucherId("");
  }, [saleDate]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        if (formOpen) {
          setFormOpen(false);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, formOpen, isPending, onClose]);

  function closeForm() {
    setFormOpen(false);
    setForm(emptyForm());
  }

  function openCreateNew() {
    const remaining = day.remaining_gs > 0 ? String(day.remaining_gs) : "";
    setForm(
      emptyForm({
        status: "draft",
        issued_date: day.sale_date,
        face_value_gs: remaining,
      }),
    );
    setFormTitle(`Create voucher for ${formatDisplayDate(day.sale_date)}`);
    setFormOpen(true);
  }

  function openEdit(voucher: VenueVoucher) {
    setForm(voucherToForm(voucher));
    setFormTitle(`Edit ${voucher.voucher_number}`);
    setFormOpen(true);
  }

  function handleLinkVoucher(voucher: VenueVoucher) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      formData.set("voucher_number", voucher.voucher_number);
      formData.set("voucher_name", voucher.voucher_name);
      formData.set("face_value_gs", String(voucher.face_value_gs));
      formData.set("status", "issued");
      formData.set("issued_date", day.sale_date);
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
      setSelectedVoucherId("");
      router.refresh();
    });
  }

  function handleUnlink(voucher: VenueVoucher) {
    if (voucher.status === "redeemed") {
      toast.error(
        "Unlink the redemption first before removing this voucher from the issue day.",
      );
      return;
    }
    if (
      !window.confirm(
        `Unlink ${voucher.voucher_number} from ${formatDisplayDate(day.sale_date)}? The voucher will stay in your list as a draft.`,
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

  function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      if (form.id) formData.set("id", form.id);
      formData.set("voucher_number", form.voucher_number);
      formData.set("voucher_name", form.voucher_name);
      formData.set("face_value_gs", form.face_value_gs || "0");
      formData.set("status", form.id ? form.status : "draft");
      formData.set("issued_date", form.issued_date || day.sale_date);
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
      closeForm();
      router.refresh();
    });
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!isPending && event.target === event.currentTarget) {
          if (formOpen) closeForm();
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
              Voucher Issue {formatMoney(voucherIssueAmount(day))} · Allocated{" "}
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
            onClick={() => (formOpen ? closeForm() : onClose())}
            disabled={isPending}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {formOpen ? (
            <VoucherIssueForm
              title={formTitle}
              form={form}
              setForm={setForm}
              canEdit={canEdit}
              isPending={isPending}
              paymentForms={paymentForms}
              onClose={closeForm}
              onSave={handleSave}
            />
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
                      Sales → Vouchers.
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
                              {voucher.status === "draft" ? "[Draft] " : ""}
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
                              handleLinkVoucher(selectedVoucher);
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
                      onClick={openCreateNew}
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
                                onClick={() => openEdit(voucher)}
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
                                onClick={() => handleUnlink(voucher)}
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

function VoucherIssueForm({
  title,
  form,
  setForm,
  canEdit,
  isPending,
  paymentForms,
  onClose,
  onSave,
}: {
  title: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  canEdit: boolean;
  isPending: boolean;
  paymentForms: VenueTender[];
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg text-[#3D421F]">{title}</h3>
          <p className="mt-1 text-sm text-black/55">
            Record keeping for issued vouchers. One daily tender total can be
            split across multiple voucher entries.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F]"
          aria-label="Back to list"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Voucher number *">
          <input
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.voucher_number}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, voucher_number: e.target.value }))
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
              setForm((prev) => ({ ...prev, voucher_name: e.target.value }))
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
              setForm((prev) => ({ ...prev, face_value_gs: e.target.value }))
            }
            placeholder="0.00"
          />
        </Field>
        <Field label="Payment form">
          <select
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.payment_form_tender_id}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                payment_form_tender_id: e.target.value,
              }))
            }
          >
            <option value="">Select…</option>
            {paymentForms.map((tender) => (
              <option key={tender.id} value={tender.id}>
                {tender.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purchaser">
          <input
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.purchaser_name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, purchaser_name: e.target.value }))
            }
          />
        </Field>
        <Field label="Recipient">
          <input
            className={inputClass}
            disabled={!canEdit || isPending}
            value={form.recipient_name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, recipient_name: e.target.value }))
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

      <div className="flex flex-wrap justify-end gap-2 border-t border-black/10 pt-4">
        <button
          type="button"
          disabled={isPending}
          onClick={onClose}
          className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-[#3D421F] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canEdit || isPending || !form.voucher_number.trim()}
          onClick={onSave}
          className="rounded-md bg-[var(--venue-primary,#3D421F)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {form.id ? "Save voucher" : "Create voucher"}
        </button>
      </div>
    </div>
  );
}

/** Button shown beside Voucher Issue / Redeem when an amount is entered. */
export function VoucherIssueConfigureButton({
  visible,
  balanced,
  onClick,
  disabled,
  title = "Configure issued vouchers",
}: {
  visible: boolean;
  balanced?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  if (!visible) return null;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50",
        balanced
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
      )}
    >
      <Ticket className="h-3.5 w-3.5" />
    </button>
  );
}
