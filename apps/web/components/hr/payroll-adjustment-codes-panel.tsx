"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
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

function slugCodeFromLabel(label: string, category: PayrollLineCategory): string {
  const base = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  const prefix =
    category === "deduction"
      ? "DED"
      : category === "fixed"
        ? "FIX"
        : category === "addon"
          ? "ADD"
          : "VAR";
  return base || `${prefix}_CUSTOM`;
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

  const codesJson = useMemo(() => JSON.stringify(codes), [codes]);

  function updateCode(
    code: string,
    patch: Partial<PayrollAdjustmentCodeConfig>,
  ) {
    setCodes((prev) =>
      prev.map((row) => (row.code === code ? { ...row, ...patch } : row)),
    );
  }

  function addCustomCode(category: PayrollLineCategory) {
    const label = "Custom code";
    let code = slugCodeFromLabel(label, category);
    let n = 1;
    const existing = new Set(codes.map((c) => c.code));
    while (existing.has(code)) {
      code = `${slugCodeFromLabel(label, category)}_${n}`;
      n += 1;
    }

    const row: PayrollAdjustmentCodeConfig = {
      code,
      label,
      description: "",
      category,
      applyBehavior: "separate_line",
      behaviorExplanation:
        "Posted as its own pay line for this category. Adjust behaviour below if it should fold into fixed pay or stay off the payslip.",
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
  }

  function removeCode(code: string) {
    setCodes((prev) => prev.filter((c) => c.code !== code || c.systemProtected));
    if (expandedCode === code) setExpandedCode(null);
  }

  function resetToDefaults() {
    setCodes(DEFAULT_PAYROLL_ADJUSTMENT_CODES.map((c) => ({ ...c })));
    setExpandedCode(DEFAULT_PAYROLL_ADJUSTMENT_CODES[0]?.code ?? null);
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
            adjustments on a payroll run. Edit labels, descriptions, input
            options, and apply behaviour per code. System codes keep a stable
            identifier; custom codes can be added or removed.
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
          const rows = codes.filter((c) => c.category === meta.category);
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addCustomCode(meta.category)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add code
                </Button>
              </div>

              <div className="space-y-2">
                {rows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-black/15 px-3 py-4 text-sm text-black/45">
                    No codes in this category yet.
                  </p>
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
