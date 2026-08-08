"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { upsertVisaProProvider } from "@/lib/actions/hr-visa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type { VisaProProvider } from "@/lib/hr/types";

type VisaProviderDialogProps = {
  provider: VisaProProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function VisaProviderDialog({
  provider,
  open,
  onOpenChange,
  onSaved,
}: VisaProviderDialogProps) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [leadDays, setLeadDays] = useState("30");

  useEffect(() => {
    if (!open) return;
    setName(provider?.name ?? "");
    setContactPerson(provider?.contact_person ?? "");
    setContactEmail(provider?.contact_email ?? "");
    setContactPhone(provider?.contact_phone ?? "");
    setLeadDays(String(provider?.lead_days || 30));
  }, [open, provider]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, pending]);

  if (!open || typeof document === "undefined") return null;

  function handleSave() {
    if (!name.trim()) {
      toast.error("PRO provider name is required.");
      return;
    }

    startTransition(async () => {
      const result = await upsertVisaProProvider({
        id: provider?.id,
        name: name.trim(),
        contactPerson,
        contactEmail,
        contactPhone,
        leadDays: Number(leadDays) || 30,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(provider ? "PRO provider updated." : "PRO provider created.");
      onSaved();
      onOpenChange(false);
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onOpenChange(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visa-provider-dialog-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="visa-provider-dialog-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              {provider ? "Edit PRO provider" : "Add PRO provider"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Name and contact details only.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="visa-provider-name">Company name</Label>
            <Input
              id="visa-provider-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="PRO company name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visa-contact">Contact person</Label>
            <Input
              id="visa-contact"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="visa-phone">Phone</Label>
              <Input
                id="visa-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visa-email">Email</Label>
              <Input
                id="visa-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visa-lead">Lead days (expiry warning)</Label>
            <Input
              id="visa-lead"
              type="number"
              min={0}
              max={365}
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={handleSave}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Save
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
