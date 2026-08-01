"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveHrPayrollAdjustmentCodesSettings } from "@/lib/actions/hr-payroll";
import {
  DEFAULT_PAYROLL_ADJUSTMENT_CODES,
  PAYROLL_ADJUSTMENT_APPLY_BEHAVIOR_LABELS,
  PAYROLL_CATEGORY_META,
  type PayrollAdjustmentApplyBehavior,
  type PayrollAdjustmentCodeConfig,
  type PayrollLineCategory,
} from "@/lib/hr/payroll";
import { cn } from "@/lib/utils";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const BEHAVIOR_OPTIONS = Object.entries(
  PAYROLL_ADJUSTMENT_APPLY_BEHAVIOR_LABELS,
).map(([value, label]) => ({
  value: value as PayrollAdjustmentApplyBehavior,
  label,
}));

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save adjustment codes"}
    </Button>
  );
}

function ToggleChip({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        checked
          ? "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]"
          : "border-black/10 bg-white text-black/45 hover:bg-black/[0.03]",
      )}
    >
      {label}
    </button>
  );
}

function categoryCodePrefix(category: PayrollLineCategory): string {
  if (category === "deduction") return "DED";
  if (category === "fixed") return "FIX";
  if (category === "addon") return "ADD";
  return "VAR";
}

function slugCodeFromLabel(
  label: string,
  category: PayrollLineCategory,
): string {
  const base = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  return base || `${categoryCodePrefix(category)}_CUSTOM`;
}

function uniqueCode(
  desired: string,
  existing: Set<string>,
  category: PayrollLineCategory,
): string {
  const fallback = `${categoryCodePrefix(category)}_CUSTOM`;
  let code = (desired || fallback).slice(0, 32);
  if (!existing.has(code)) return code;
  let n = 2;
  while (existing.has(`${code.slice(0, 28)}_${n}`)) n += 1;
  return `${code.slice(0, 28)}_${n}`;
}

function nextSortOrder(
  codes: PayrollAdjustmentCodeConfig[],
  category: PayrollLineCategory,
): number {
  const max = codes
    .filter((c) => c.category === category)
    .reduce((acc, c) => Math.max(acc, c.sortOrder), 0);
  return max + 10;
}

function defaultBehaviorForCategory(
  category: PayrollLineCategory,
): PayrollAdjustmentApplyBehavior {
  if (category === "fixed" || category === "addon") {
    return "fold_when_days_or_percent";
  }
  return "separate_line";
}

function defaultBehaviorExplanation(
  category: PayrollLineCategory,
): string {
  if (category === "deduction") {
    return "Posted as its own deduction line. Adjust behaviour below if it should fold into fixed pay or stay off the payslip.";
  }
  if (category === "fixed" || category === "addon") {
    return "Flat amounts appear as a separate line. Days or % of daily rate fold into BASIC / ACCOM / TRANSP when that behaviour is selected.";
  }
  return "Posted as its own variable earning line. Amount can be entered directly or derived from days / % of daily rate.";
}

type DraftNewCode = {
  label: string;
  code: string;
  description: string;
  codeTouched: boolean;
};

function emptyDraft(): DraftNewCode {
  return { label: "", code: "", description: "", codeTouched: false };
}

export function PayrollAdjustmentCodesPanel({
  codes: initialCodes,
}: {
  codes: PayrollAdjustmentCodeConfig[];
}) {
  const [codes, setCodes] = useState<PayrollAdjustmentCodeConfig[]>(
    () => initialCodes,
  );
  const [expandedCode, setExpandedCode] = useState<string | null>(
    initialCodes[0]?.code ?? null,
  );
  const [addingCategory, setAddingCategory] =
    useState<PayrollLineCategory | null>(null);
  const [draft, setDraft] = useState<DraftNewCode>(emptyDraft);
  const [addError, setAddError] = useState<string | null>(null);

  const codesJson = useMemo(() => JSON.stringify(codes), [codes]);
  const existingCodes = useMemo(
    () => new Set(codes.map((c) => c.code)),
    [codes],
  );

  function updateCode(
    code: string,
    patch: Partial<PayrollAdjustmentCodeConfig>,
  ) {
    setCodes((prev) =>
      prev.map((row) => (row.code === code ? { ...row, ...patch } : row)),
    );
  }

  function openAddForm(category: PayrollLineCategory) {
    setAddingCategory(category);
    setDraft(emptyDraft());
    setAddError(null);
    setExpandedCode(null);
  }

  function closeAddForm() {
    setAddingCategory(null);
    setDraft(emptyDraft());
    setAddError(null);
  }

  function commitNewCode(category: PayrollLineCategory) {
    const label = draft.label.trim();
    if (!label) {
      setAddError("Enter a label for the new adjustment.");
      return;
    }

    const desired = draft.codeTouched
      ? draft.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "")
      : slugCodeFromLabel(label, category);
    const code = uniqueCode(desired, existingCodes, category);
    if (!code) {
      setAddError("Enter a valid code (letters, numbers, underscore).");
      return;
    }

    const row: PayrollAdjustmentCodeConfig = {
      code,
      label,
      description: draft.description.trim(),
      category,
      applyBehavior: defaultBehaviorForCategory(category),
      behaviorExplanation: defaultBehaviorExplanation(category),
      excludeFromPayslip: false,
      allowAmountInput: true,
      allowDaysInput: true,
      allowPercentInput: true,
      active: true,
      sortOrder: nextSortOrder(codes, category),
      systemProtected: false,
    };

    setCodes((prev) => [...prev, row]);
    setExpandedCode(code);
    closeAddForm();
  }

  function removeCode(code: string) {
    setCodes((prev) =>
      prev.filter((c) => c.code !== code || c.systemProtected),
    );
    if (expandedCode === code) setExpandedCode(null);
  }

  function resetToDefaults() {
    setCodes(DEFAULT_PAYROLL_ADJUSTMENT_CODES.map((c) => ({ ...c })));
    setExpandedCode(DEFAULT_PAYROLL_ADJUSTMENT_CODES[0]?.code ?? null);
    closeAddForm();
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">
            Payroll Adjustments &amp; Codes
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-black/55">
            Catalogue of categories and sub-codes used when adding manual
            adjustments on a payroll run. Add your own kinds under each
            category, then edit labels, input options, and apply behaviour.
            System codes keep a stable identifier; custom codes can be removed.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetToDefaults}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset defaults
        </Button>
      </div>

      <GuardedSettingsForm
        action={saveHrPayrollAdjustmentCodesSettings}
        className="mt-6 space-y-3"
        watch={codesJson}
      >
        <input type="hidden" name="codes_json" value={codesJson} />

        {PAYROLL_CATEGORY_META.map((meta) => {
          const rows = codes
            .filter((c) => c.category === meta.category)
            .slice()
            .sort(
              (a, b) =>
                a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
            );
          const isAdding = addingCategory === meta.category;

          return (
            <section
              key={meta.category}
              className="space-y-4 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/45 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg text-[#3D421F]">
                    {meta.label}
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm text-black/55">
                    {meta.description}
                  </p>
                  <p className="mt-1.5 max-w-3xl text-xs text-black/45">
                    <span className="font-medium text-black/55">
                      Category behaviour:{" "}
                    </span>
                    {meta.behaviorOverview}
                  </p>
                </div>
                {!isAdding ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-[var(--venue-primary,#818a40)]/35 bg-white text-[#3D421F] hover:bg-[var(--venue-primary,#818a40)]/10"
                    onClick={() => openAddForm(meta.category)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add {meta.label.toLowerCase()} code
                  </Button>
                ) : null}
              </div>

              {isAdding ? (
                <div className="space-y-3 rounded-lg border border-[var(--venue-primary,#818a40)]/35 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#3D421F]">
                        New {meta.label.toLowerCase()} adjustment
                      </p>
                      <p className="mt-0.5 text-xs text-black/45">
                        Give it a clear label. Code is auto-generated; you can
                        edit it before adding.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Cancel add"
                      onClick={closeAddForm}
                      className="inline-flex size-8 items-center justify-center rounded-md text-black/40 transition hover:bg-black/5 hover:text-[#3D421F]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
                      <Label htmlFor={`new-${meta.category}-label`}>
                        Label
                      </Label>
                      <Input
                        id={`new-${meta.category}-label`}
                        value={draft.label}
                        autoFocus
                        placeholder={`e.g. ${
                          meta.category === "deduction"
                            ? "Uniform deduction"
                            : meta.category === "fixed"
                              ? "Housing correction"
                              : meta.category === "addon"
                                ? "Mid-cycle top-up"
                                : "Night shift premium"
                        }`}
                        onChange={(e) => {
                          const label = e.target.value;
                          setDraft((prev) => ({
                            ...prev,
                            label,
                            code: prev.codeTouched
                              ? prev.code
                              : slugCodeFromLabel(label, meta.category),
                          }));
                          setAddError(null);
                        }}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`new-${meta.category}-code`}>Code</Label>
                      <Input
                        id={`new-${meta.category}-code`}
                        value={draft.code}
                        placeholder="AUTO_CODE"
                        onChange={(e) => {
                          setDraft((prev) => ({
                            ...prev,
                            codeTouched: true,
                            code: e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9_]/g, "")
                              .slice(0, 32),
                          }));
                          setAddError(null);
                        }}
                        className="h-8 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                      <Label htmlFor={`new-${meta.category}-desc`}>
                        Description (optional)
                      </Label>
                      <Input
                        id={`new-${meta.category}-desc`}
                        value={draft.description}
                        placeholder="Short note for HR when picking this code on a run"
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        className="h-8"
                      />
                    </div>
                  </div>

                  {addError ? (
                    <p className="text-sm text-red-700">{addError}</p>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={closeAddForm}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => commitNewCode(meta.category)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to {meta.label.toLowerCase()}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                {rows.length === 0 && !isAdding ? (
                  <div className="rounded-lg border border-dashed border-black/15 px-3 py-6 text-center">
                    <p className="text-sm text-black/45">
                      No codes in this category yet.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-1.5"
                      onClick={() => openAddForm(meta.category)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add first {meta.label.toLowerCase()} code
                    </Button>
                  </div>
                ) : (
                  rows.map((row) => {
                    const open = expandedCode === row.code;
                    return (
                      <div
                        key={row.code}
                        className={cn(
                          "overflow-hidden rounded-lg border border-black/10",
                          !row.active && "opacity-60",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCode(open ? null : row.code)
                          }
                          className="flex w-full items-center gap-3 bg-black/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-black/[0.04]"
                        >
                          <span className="font-mono text-xs font-semibold text-[#3D421F]">
                            {row.code}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-[#3D421F]">
                            {row.label}
                          </span>
                          {!row.systemProtected ? (
                            <span className="hidden rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-black/5 text-black/45 sm:inline">
                              Custom
                            </span>
                          ) : null}
                          <span className="hidden text-xs text-black/45 sm:inline">
                            {
                              PAYROLL_ADJUSTMENT_APPLY_BEHAVIOR_LABELS[
                                row.applyBehavior
                              ]
                            }
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              row.active
                                ? "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]"
                                : "bg-black/5 text-black/45",
                            )}
                          >
                            {row.active ? "Active" : "Off"}
                          </span>
                        </button>

                        {open ? (
                          <div className="space-y-4 border-t border-black/10 bg-white p-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <div className="space-y-1.5">
                                <Label>Code</Label>
                                {row.systemProtected ? (
                                  <p className="flex h-8 items-center font-mono text-sm text-[#3D421F]">
                                    {row.code}
                                    <span className="ml-2 text-[10px] font-sans font-medium uppercase tracking-wide text-black/40">
                                      System
                                    </span>
                                  </p>
                                ) : (
                                  <Input
                                    value={row.code}
                                    onChange={(e) => {
                                      const next = e.target.value
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9_]/g, "")
                                        .slice(0, 32);
                                      if (!next || existingCodes.has(next)) {
                                        if (next && next !== row.code) return;
                                      }
                                      setCodes((prev) =>
                                        prev.map((c) =>
                                          c.code === row.code
                                            ? { ...c, code: next || c.code }
                                            : c,
                                        ),
                                      );
                                      setExpandedCode(next || row.code);
                                    }}
                                    className="h-8 font-mono text-xs"
                                    aria-label={`${row.label} code`}
                                  />
                                )}
                              </div>

                              <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
                                <Label>Label</Label>
                                <Input
                                  value={row.label}
                                  onChange={(e) =>
                                    updateCode(row.code, {
                                      label: e.target.value,
                                    })
                                  }
                                  className="h-8"
                                  aria-label={`${row.code} label`}
                                />
                              </div>

                              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                                <Label>Description</Label>
                                <Input
                                  value={row.description}
                                  onChange={(e) =>
                                    updateCode(row.code, {
                                      description: e.target.value,
                                    })
                                  }
                                  className="h-8"
                                  aria-label={`${row.code} description`}
                                />
                              </div>

                              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                                <Label>Apply behaviour</Label>
                                <select
                                  value={row.applyBehavior}
                                  onChange={(e) =>
                                    updateCode(row.code, {
                                      applyBehavior: e.target
                                        .value as PayrollAdjustmentApplyBehavior,
                                    })
                                  }
                                  className={lightSelectClass}
                                  aria-label={`${row.code} apply behaviour`}
                                >
                                  {BEHAVIOR_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                                <Label>Behaviour explanation</Label>
                                <textarea
                                  value={row.behaviorExplanation}
                                  onChange={(e) =>
                                    updateCode(row.code, {
                                      behaviorExplanation: e.target.value,
                                    })
                                  }
                                  rows={3}
                                  className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                                  aria-label={`${row.code} behaviour explanation`}
                                />
                                <p className="text-xs text-black/45">
                                  Shown here for operators; keep this accurate
                                  so HR understands how the code affects the
                                  run and payslip.
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Inputs &amp; visibility</Label>
                              <div className="flex flex-wrap gap-1.5">
                                <ToggleChip
                                  checked={row.active}
                                  onChange={(active) =>
                                    updateCode(row.code, { active })
                                  }
                                  label="Active"
                                  title="Inactive codes are hidden from the add-adjustment picker"
                                />
                                <ToggleChip
                                  checked={row.allowAmountInput}
                                  onChange={(allowAmountInput) =>
                                    updateCode(row.code, { allowAmountInput })
                                  }
                                  label="Amount"
                                />
                                <ToggleChip
                                  checked={row.allowDaysInput}
                                  onChange={(allowDaysInput) =>
                                    updateCode(row.code, { allowDaysInput })
                                  }
                                  label="Days"
                                />
                                <ToggleChip
                                  checked={row.allowPercentInput}
                                  onChange={(allowPercentInput) =>
                                    updateCode(row.code, {
                                      allowPercentInput,
                                    })
                                  }
                                  label="% of daily rate"
                                />
                                <ToggleChip
                                  checked={row.excludeFromPayslip}
                                  onChange={(excludeFromPayslip) =>
                                    updateCode(row.code, {
                                      excludeFromPayslip,
                                    })
                                  }
                                  label="Hide on payslip"
                                  title="Omits this code from payslip line lists"
                                />
                              </div>
                            </div>

                            {!row.systemProtected ? (
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 text-red-700 hover:bg-red-50"
                                  onClick={() => removeCode(row.code)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remove code
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {!isAdding && rows.length > 0 ? (
                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-[#3D421F] hover:bg-[var(--venue-primary,#818a40)]/10"
                    onClick={() => openAddForm(meta.category)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add another {meta.label.toLowerCase()} code
                  </Button>
                </div>
              ) : null}
            </section>
          );
        })}

        <div className="flex justify-end border-t border-black/10 pt-4">
          <SaveButton />
        </div>
      </GuardedSettingsForm>
    </div>
  );
}
