"use client";

import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { updateCertificationTypeDetails } from "@/lib/actions/hr-certifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { splitGrossAtVatRate } from "@/lib/hr/certification-costs";
import type { CertificationType } from "@/lib/hr/types";

type CertificationTypeDialogProps = {
  certification: CertificationType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function CertificationTypeDialog({
  certification,
  open,
  onOpenChange,
  onSaved,
}: CertificationTypeDialogProps) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(certification.label);
  const [name, setName] = useState(certification.name);
  const [renewalMonths, setRenewalMonths] = useState(
    String(certification.renewal_months || 12),
  );
  const [leadDays, setLeadDays] = useState(
    String(certification.lead_days || 30),
  );
  const [providerCompany, setProviderCompany] = useState(
    certification.provider_company,
  );
  const [contactPerson, setContactPerson] = useState(
    certification.contact_person,
  );
  const [contactEmail, setContactEmail] = useState(
    certification.contact_email,
  );
  const [contactPhone, setContactPhone] = useState(
    certification.contact_phone,
  );
  const [costValue, setCostValue] = useState(
    certification.cost_value ? String(certification.cost_value) : "",
  );

  if (!open || typeof document === "undefined") return null;

  function parseMoney(raw: string): number {
    if (raw.trim() === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  }

  const grossAmount = parseMoney(costValue);
  const { net: costNetAmount, vat: costVatAmount } =
    splitGrossAtVatRate(grossAmount);

  function handleGrossChange(raw: string) {
    setCostValue(raw);
  }

  function handleSave() {
    startTransition(async () => {
      const gross = parseMoney(costValue);
      const { net, vat } = splitGrossAtVatRate(gross);
      const result = await updateCertificationTypeDetails({
        id: certification.id,
        name,
        label,
        renewalMonths: Number(renewalMonths) || 12,
        leadDays: Number(leadDays) || 30,
        providerCompany,
        contactPerson,
        contactEmail,
        contactPhone,
        costNet: net,
        costVat: vat,
        costValue: gross,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Certification defaults updated.");
      onSaved();
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cert-type-dialog-title"
        className="relative w-full max-w-lg rounded-2xl border border-black/10 bg-white p-5 shadow-xl"
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
          disabled={pending}
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <h2
          id="cert-type-dialog-title"
          className="pr-8 font-nav text-base font-semibold text-[#3D421F]"
        >
          Edit certification defaults
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Validity, provider, and cost per application used for employee
          tracking and request emails.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-label">Label</Label>
            <Input
              id="cert-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={pending}
              placeholder="Short header label (e.g. OCH)"
            />
            <p className="text-[11px] text-black/40">
              Shown on the employees table column headers.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-name">Name</Label>
            <Input
              id="cert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-validity">Validity (months)</Label>
            <Input
              id="cert-validity"
              type="number"
              min={1}
              max={120}
              value={renewalMonths}
              onChange={(e) => setRenewalMonths(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-lead">Reminder lead (days)</Label>
            <Input
              id="cert-lead"
              type="number"
              min={0}
              max={365}
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-provider">Provider company</Label>
            <Input
              id="cert-provider"
              value={providerCompany}
              onChange={(e) => setProviderCompany(e.target.value)}
              disabled={pending}
              placeholder="Training provider name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-contact">Contact person</Label>
            <Input
              id="cert-contact"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-phone">Contact number</Label>
            <Input
              id="cert-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              disabled={pending}
              placeholder="+971 …"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-email">Email</Label>
            <Input
              id="cert-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
              Cost per application (AED)
            </p>
            <p className="text-[11px] text-black/40">
              Enter gross (VAT-inclusive). Net and VAT are calculated at 5%.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-cost">Gross</Label>
            <Input
              id="cert-cost"
              type="number"
              min={0}
              step="0.01"
              value={costValue}
              onChange={(e) => handleGrossChange(e.target.value)}
              disabled={pending}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-cost-net">Net</Label>
            <Input
              id="cert-cost-net"
              type="number"
              min={0}
              step="0.01"
              value={grossAmount > 0 ? costNetAmount.toFixed(2) : ""}
              readOnly
              disabled
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-cost-vat">VAT (5%)</Label>
            <Input
              id="cert-cost-vat"
              type="number"
              min={0}
              step="0.01"
              value={grossAmount > 0 ? costVatAmount.toFixed(2) : ""}
              readOnly
              disabled
              placeholder="0"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={handleSave}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
