"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Unlink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  markVenueVoucherRedeemed,
  saveVenueVoucher,
} from "@/lib/actions/sales";
import { formatDisplayDate } from "@/lib/dates/display";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import {
  buildRedeemDayAllocationForDate,
  formatLocalDate,
  voucherRedeemAmount,
} from "@/lib/sales/vouchers-calculations";
import type { VenueVoucher } from "@/lib/sales/vouchers-types";
import { VOUCHER_STATUS_LABELS } from "@/lib/sales/vouchers-types";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const inputClass =
  "mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[#3D421F]/35 disabled:opacity-60";

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

function statusBadgeClass(status: VenueVoucher["status"]): string {
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

type VoucherRedeemDayDialogProps = {
  open: boolean;
  onClose: () => void;
  saleDate: string;
  redeemAmountGs: number;
  vouchers: VenueVoucher[];
  canEdit: boolean;
};

export function VoucherRedeemDayDialog({
  open,
  onClose,
  saleDate,
  redeemAmountGs,
  vouchers,
  canEdit,
}: VoucherRedeemDayDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedVoucherId, setSelectedVoucherId] = useState("");

  const day = useMemo(
    () =>
      buildRedeemDayAllocationForDate(saleDate, redeemAmountGs, vouchers),
    [saleDate, redeemAmountGs, vouchers],
  );

  const linkableVouchers = useMemo(() => {
    const linkedIds = new Set(day.vouchers.map((v) => v.id));
    return vouchers
      .filter((v) => v.status === "issued" && !linkedIds.has(v.id))
      .slice()
      .sort((a, b) => a.issued_date.localeCompare(b.issued_date));
  }, [vouchers, day.vouchers]);

  const selectedVoucher = useMemo(
    () => linkableVouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [linkableVouchers, selectedVoucherId],
  );

  const canLinkMore = day.remaining_gs > 0.005;

  useEffect(() => {
    if (!open) setSelectedVoucherId("");
  }, [open]);

  useEffect(() => {
    setSelectedVoucherId("");
  }, [saleDate]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isPending, onClose]);

  function handleLinkVoucher(voucher: VenueVoucher) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      formData.set("redeemed_date", day.sale_date);
      const result = await markVenueVoucherRedeemed(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher linked to this redeem day.");
      setSelectedVoucherId("");
      router.refresh();
    });
  }

  function handleUnlink(voucher: VenueVoucher) {
    if (
      !window.confirm(
        `Unlink ${voucher.voucher_number} from ${formatDisplayDate(day.sale_date)}? The voucher will return to Issued.`,
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
      formData.set("status", "issued");
      formData.set("issued_date", voucher.issued_date || formatLocalDate());
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
      toast.saved(result.success ?? "Voucher unlinked from this redeem day.");
      router.refresh();
    });
  }

  if (!open || typeof document === "undefined") return null;

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
              Voucher Redeem {formatMoney(voucherRedeemAmount(day))} · Allocated{" "}
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
            onClick={onClose}
            disabled={isPending}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
                {linkableVouchers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-black/15 px-3 py-4 text-sm text-black/45">
                    No issued vouchers available. Create and issue vouchers
                    under Issue from daily tenders first.
                  </p>
                ) : (
                  <>
                    <Field label="Issued voucher">
                      <select
                        className={inputClass}
                        disabled={!canEdit || isPending}
                        value={selectedVoucherId}
                        onChange={(e) => setSelectedVoucherId(e.target.value)}
                      >
                        <option value="">Select issued voucher…</option>
                        {linkableVouchers.map((voucher) => (
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
                              handleLinkVoucher(selectedVoucher);
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
                          <button
                            type="button"
                            title="Unlink from this day"
                            disabled={isPending}
                            onClick={() => handleUnlink(voucher)}
                            className="rounded-md p-1.5 text-[#3D421F] hover:bg-black/[0.04] disabled:opacity-50"
                          >
                            <Unlink className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
