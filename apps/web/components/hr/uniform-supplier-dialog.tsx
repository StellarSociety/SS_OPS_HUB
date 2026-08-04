"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  createUniformSupplier,
  updateUniformSupplier,
} from "@/lib/actions/hr-uniform-suppliers";
import type { UniformSupplierRow } from "@/lib/hr/types";

type UniformSupplierDialogProps = {
  open: boolean;
  supplier?: UniformSupplierRow | null;
  onClose: () => void;
};

export function UniformSupplierDialog({
  open,
  supplier,
  onClose,
}: UniformSupplierDialogProps) {
  const isEdit = Boolean(supplier);
  const [name, setName] = useState("");
  const [ordersEmail, setOrdersEmail] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setOrdersEmail(supplier?.orders_email ?? "");
    setContactPerson(supplier?.contact_person ?? "");
    setContactPhone(supplier?.contact_phone ?? "");
    setNotes(supplier?.notes ?? "");
  }, [open, supplier]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Supplier name is required.");
      return;
    }

    setPending(true);
    try {
      const payload = {
        name: name.trim(),
        ordersEmail: ordersEmail.trim(),
        contactPerson: contactPerson.trim(),
        contactPhone: contactPhone.trim(),
        notes: notes.trim(),
      };

      if (isEdit && supplier) {
        await updateUniformSupplier({ supplierId: supplier.id, ...payload });
        toast.saved("Supplier updated.");
      } else {
        await createUniformSupplier(payload);
        toast.saved("Supplier added.");
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save supplier.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit supplier" : "Add supplier"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Uniform · Suppliers
            </p>
            <h2 className="font-serif text-xl text-[#3D421F]">
              {isEdit ? "Edit supplier" : "Add supplier"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="supplier-name">Supplier name</Label>
            <Input
              id="supplier-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company or vendor name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-orders-email">Orders email</Label>
            <Input
              id="supplier-orders-email"
              type="email"
              value={ordersEmail}
              onChange={(e) => setOrdersEmail(e.target.value)}
              placeholder="orders@supplier.com"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplier-contact-person">Contact person</Label>
              <Input
                id="supplier-contact-person"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-contact-phone">Phone number</Label>
              <Input
                id="supplier-contact-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-notes">Notes</Label>
            <Input
              id="supplier-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional internal notes"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              className="text-[#3D421F]"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add supplier"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
