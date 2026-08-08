"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { updateStaffInsurance } from "@/lib/actions/hr-insurance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type {
  InsuranceCategoryWithDefaults,
  InsuranceEmployeeRow,
} from "@/lib/hr/types";

type InsuranceEmployeeEditDialogProps = {
  row: InsuranceEmployeeRow | null;
  categories: InsuranceCategoryWithDefaults[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const selectClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function InsuranceEmployeeEditDialog({
  row,
  categories,
  open,
  onOpenChange,
  onSaved,
}: InsuranceEmployeeEditDialogProps) {
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    const suggestedCategory =
      row.category || row.suggestedCategoryName || "";
    const suggestedValue =
      row.value != null
        ? String(row.value)
        : row.suggestedValue != null
          ? String(row.suggestedValue)
          : "";
    setCategory(suggestedCategory);
    setValue(suggestedValue);
    setIssueDate(row.issueDate ?? "");
    setExpiryDate(row.expiryDate ?? "");
  }, [open, row]);

  if (!open || !row || typeof document === "undefined") return null;

  function handleCategoryChange(name: string) {
    setCategory(name);
    const match = categories.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (match && (!value || value === "0")) {
      setValue(String(match.default_medical_value || ""));
    }
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateStaffInsurance({
        staffId: row!.staff.id,
        insuranceCategory: category.trim() || null,
        medicalInsuranceValue:
          value.trim() === "" ? null : Number(value) || 0,
        medicalInsuranceIssueDate: issueDate || null,
        medicalInsuranceExpiryDate: expiryDate || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Insurance updated.");
      onSaved();
      onOpenChange(false);
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="insurance-employee-edit-title"
        className="relative w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-xl"
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
          id="insurance-employee-edit-title"
          className="pr-8 font-nav text-base font-semibold text-[#3D421F]"
        >
          {row.staff.full_name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Emp. {row.staff.emp_no}
          {row.suggestedCategoryName && !row.category ? (
            <span>
              {" "}
              · Suggested: {row.suggestedCategoryName}
            </span>
          ) : null}
        </p>

        <div className="mt-4 grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ins-emp-category">Insurance category</Label>
            <select
              id="ins-emp-category"
              className={selectClass}
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={pending}
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins-emp-value">Insurance value (AED)</Label>
            <Input
              id="ins-emp-value"
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ins-emp-issue">Issue date</Label>
              <Input
                id="ins-emp-issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-emp-expiry">Expiry date</Label>
              <Input
                id="ins-emp-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
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
