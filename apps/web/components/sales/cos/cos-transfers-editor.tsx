"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/components/ui/toast";
import {
  createCosTransferAction,
  deleteCosTransferAction,
} from "@/lib/actions/cos";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  type CostCentre,
  type VenueCosTransfer,
} from "@/lib/sales/cos-types";

const MONEY = (n: number) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

const fieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

export function CosTransfersEditor({
  transfers: initial,
  today,
  canEdit,
}: {
  transfers: VenueCosTransfer[];
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [transfers, setTransfers] = useState(initial);
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState<CostCentre>("food");
  const [to, setTo] = useState<CostCentre>("beverage");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<VenueCosTransfer | null>(null);

  const amountNum = Number(amount.replace(/,/g, ""));
  const canAdd = Boolean(date) && from !== to && amountNum > 0;

  function add() {
    if (!canAdd) return;
    startTransition(async () => {
      const res = await createCosTransferAction({
        transfer_date: date,
        from_centre: from,
        to_centre: to,
        amount_net: amountNum,
        note,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTransfers((t) =>
        [
          { ...res.transfer, amount_net: Number(res.transfer.amount_net) },
          ...t,
        ].sort((a, b) => b.transfer_date.localeCompare(a.transfer_date)),
      );
      setAmount("");
      setNote("");
      toast.saved("Transfer added.");
      router.refresh();
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await deleteCosTransferAction(toDelete.id);
    setTransfers((t) => t.filter((x) => x.id !== toDelete.id));
    setToDelete(null);
    toast.saved("Transfer deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        Move NET purchase value from one cost centre to another (for example
        food used at the bar). The week&apos;s cost runs pick it up
        automatically: a (+) addition for the receiving centre and a (-)
        deduction for the sending centre.
      </p>

      {canEdit ? (
        <Card className="p-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[9rem_1fr_auto_1fr_9rem_1.5fr_auto]">
            <label className="block text-xs text-black/50">
              Date
              <DateInput
                value={date}
                onChange={setDate}
                className="mt-1 w-full"
                inputClassName={fieldClass}
              />
            </label>
            <label className="block text-xs text-black/50">
              From
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value as CostCentre)}
                className={`mt-1 ${fieldClass}`}
              >
                {COST_CENTRES.map((c) => (
                  <option key={c} value={c}>
                    {COST_CENTRE_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight
              className="mb-3 hidden h-4 w-4 text-black/35 sm:block"
              aria-hidden
            />
            <label className="block text-xs text-black/50">
              To
              <select
                value={to}
                onChange={(e) => setTo(e.target.value as CostCentre)}
                className={`mt-1 ${fieldClass}`}
              >
                {COST_CENTRES.map((c) => (
                  <option key={c} value={c}>
                    {COST_CENTRE_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-black/50">
              Net amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`mt-1 text-right tabular-nums ${fieldClass}`}
              />
            </label>
            <label className="block text-xs text-black/50">
              Note
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason (optional)"
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <button
              type="button"
              disabled={pending || !canAdd}
              onClick={add}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--venue-primary,#818a40)] px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {from === to ? (
            <p className="mt-2 text-xs text-red-700">
              Choose two different cost centres.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/60 text-xs font-bold uppercase tracking-wide text-black/70">
              <th className="px-4 py-2.5 text-left">Date</th>
              <th className="px-3 py-2.5 text-left">From</th>
              <th className="px-3 py-2.5 text-left">To</th>
              <th className="px-3 py-2.5 text-right">Net amount</th>
              <th className="px-3 py-2.5 text-left">Note</th>
              {canEdit ? <th className="w-10" aria-label="Remove" /> : null}
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-black/45">
                  No transfers yet.
                </td>
              </tr>
            ) : (
              transfers.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2">
                    {ddmmyy(t.transfer_date)}
                  </td>
                  <td className="px-3 py-2 text-red-700">
                    {COST_CENTRE_LABELS[t.from_centre]}
                  </td>
                  <td className="px-3 py-2 text-emerald-700">
                    {COST_CENTRE_LABELS[t.to_centre]}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {MONEY(t.amount_net)}
                  </td>
                  <td className="px-3 py-2 text-black/60">{t.note || "—"}</td>
                  {canEdit ? (
                    <td className="text-center">
                      <button
                        type="button"
                        aria-label="Delete transfer"
                        onClick={() => setToDelete(t)}
                        className="text-black/30 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <ConfirmDeleteDialog
        open={toDelete != null}
        title="Delete this transfer?"
        description="Cost runs pick up the change the next time they are opened and saved."
        subject={
          toDelete ? (
            <p>
              {ddmmyy(toDelete.transfer_date)} ·{" "}
              {COST_CENTRE_LABELS[toDelete.from_centre]} →{" "}
              {COST_CENTRE_LABELS[toDelete.to_centre]} ·{" "}
              {MONEY(toDelete.amount_net)}
            </p>
          ) : null
        }
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
