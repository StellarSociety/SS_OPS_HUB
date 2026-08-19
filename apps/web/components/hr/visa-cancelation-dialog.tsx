"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  applyVisaCancelation,
  previewVisaRequestEmails,
} from "@/lib/actions/hr-visa";
import {
  splitGrossAtVatRate,
  splitNetAtVatRate,
} from "@/lib/hr/certification-costs";
import { upsertVisaRequestDraftBatch } from "@/lib/hr/visa-request-drafts-storage";
import type { VisaEmployeeRow } from "@/lib/hr/types";
import { VisaCancelationFileField } from "@/components/hr/visa-cancelation-file-field";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

type VisaCancelationDialogProps = {
  open: boolean;
  row: VisaEmployeeRow | null;
  venueId: string;
  onClose: () => void;
  onSaved: () => void;
};

function parseMoney(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function moneyField(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(2);
}

function syncFromGross(grossRaw: string): { gross: string; net: string } {
  const g = parseMoney(grossRaw);
  if (g <= 0) return { gross: grossRaw, net: "" };
  return { gross: grossRaw, net: moneyField(splitGrossAtVatRate(g).net) };
}

function syncFromNet(netRaw: string): { gross: string; net: string } {
  const n = parseMoney(netRaw);
  if (n <= 0) return { gross: "", net: netRaw };
  return { gross: moneyField(splitNetAtVatRate(n).gross), net: netRaw };
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function VisaCancelationDialog({
  open,
  row,
  venueId,
  onClose,
  onSaved,
}: VisaCancelationDialogProps) {
  const [cancelDate, setCancelDate] = useState(todayIso());
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !row) return;
    setCancelDate(row.cancelDate || todayIso());
    const existing = row.cancelationSpend;
    if (existing != null && existing > 0) {
      const synced = syncFromGross(moneyField(existing));
      setGross(synced.gross);
      setNet(synced.net);
    } else {
      setGross("");
      setNet("");
    }
    setError(null);
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open || !row || typeof document === "undefined") return null;

  const grossAmount = parseMoney(gross);
  const tax = grossAmount > 0 ? splitGrossAtVatRate(grossAmount).vat : 0;

  function handleSave() {
    if (!row) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cancelDate)) {
      setError("Choose a valid cancelation date.");
      return;
    }
    if (grossAmount < 0) {
      setError("Cancelation charge cannot be negative.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await applyVisaCancelation({
        staffId: row.staff.id,
        cancelDate,
        cancelationSpend: grossAmount,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const preview = await previewVisaRequestEmails({
        units: [
          {
            staffId: row.staff.id,
            requestType: "cancel",
            providerId: row.providerId,
          },
        ],
      });

      if (preview.ok && preview.previews[0]) {
        const unit = preview.previews[0];
        upsertVisaRequestDraftBatch(venueId, {
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          units: [
            {
              staffId: unit.staffId,
              empNo: unit.empNo,
              fullName: unit.fullName,
              requestType: "cancel",
              providerId: unit.providerId,
              providerName: unit.providerName,
              to: unit.to,
              subject: unit.subject,
              body: unit.body,
            },
          ],
        });
        toast.saved(
          `Cancelation saved for ${row.staff.full_name}. PRO email draft created.`,
        );
      } else {
        toast.saved(
          `Cancelation saved for ${row.staff.full_name}.${
            preview.ok ? "" : " Could not build email draft — open Email request to compose."
          }`,
        );
      }

      onSaved();
      onClose();
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visa-cancelation-title"
        className="w-full max-w-lg rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="visa-cancelation-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              Apply for cancelation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.staff.full_name}
              {row.staff.emp_no ? ` · ${row.staff.emp_no}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            disabled={pending}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="visa-cancel-date">Cancelation date</Label>
            <DateInput
              id="visa-cancel-date"
              value={cancelDate}
              onChange={setCancelDate}
              disabled={pending}
              className="w-full"
              inputClassName="h-10"
            />
          </div>

          <VisaCancelationFileField
            staffId={row.staff.id}
            empNo={row.staff.emp_no}
            fullName={row.staff.full_name}
            fileSlotId={row.latestRecordId}
            docExpiry={cancelDate}
            readOnly={pending}
          />

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Cancelation charge
            </p>
            <p className="text-xs text-black/45">
              Enter gross or net. Tax (5%) updates automatically. Charge is
              summed under Visa Cancelations in monthly expenses.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="visa-cancel-gross">Gross</Label>
                <Input
                  id="visa-cancel-gross"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={gross}
                  disabled={pending}
                  onChange={(e) => {
                    const synced = syncFromGross(e.target.value);
                    setGross(synced.gross);
                    setNet(synced.net);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="visa-cancel-tax">Tax (5%)</Label>
                <Input
                  id="visa-cancel-tax"
                  readOnly
                  tabIndex={-1}
                  value={grossAmount > 0 ? tax.toFixed(2) : ""}
                  className="bg-black/[0.03]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="visa-cancel-net">Net</Label>
                <Input
                  id="visa-cancel-net"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={net}
                  disabled={pending}
                  onChange={(e) => {
                    const synced = syncFromNet(e.target.value);
                    setGross(synced.gross);
                    setNet(synced.net);
                  }}
                />
              </div>
            </div>
          </div>

          <p className="rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-xs text-[#3D421F]">
            Saving sets status to Visa Canceled and creates a PRO cancelation
            email draft you can send from Drafts.
          </p>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            className="inline-flex h-9 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save & create draft"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
