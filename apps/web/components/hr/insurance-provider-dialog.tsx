"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Wand2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { upsertInsuranceProvider } from "@/lib/actions/hr-insurance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type {
  Department,
  InsuranceProvider,
  Position,
} from "@/lib/hr/types";

type PositionDefaultDraft = {
  key: string;
  departmentId: string;
  positionId: string;
};

type CategoryDraft = {
  key: string;
  id?: string;
  name: string;
  defaultMedicalValue: string;
  positionDefaults: PositionDefaultDraft[];
};

export type InsuranceCategoryPositionHint = {
  categoryName: string;
  departmentId: string;
  positionId: string;
};

type InsuranceProviderDialogProps = {
  provider: InsuranceProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  departments: Department[];
  positions: Position[];
  categoryPositionHints?: InsuranceCategoryPositionHint[];
};

const selectClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultsFromHints(
  categoryName: string,
  hints: InsuranceCategoryPositionHint[],
  positionsById: Map<string, Position>,
): PositionDefaultDraft[] {
  const needle = categoryName.trim().toLowerCase();
  if (!needle) return [];

  const seen = new Set<string>();
  const rows: PositionDefaultDraft[] = [];

  for (const hint of hints) {
    if (hint.categoryName.trim().toLowerCase() !== needle) continue;
    if (!hint.departmentId || !hint.positionId) continue;
    const pos = positionsById.get(hint.positionId);
    // Prefer the position's own department when available.
    const departmentId = pos?.department_id || hint.departmentId;
    const key = `${departmentId}:${hint.positionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key: newKey(),
      departmentId,
      positionId: hint.positionId,
    });
  }

  rows.sort((a, b) => {
    const pa = positionsById.get(a.positionId);
    const pb = positionsById.get(b.positionId);
    const deptCmp = a.departmentId.localeCompare(b.departmentId);
    if (deptCmp !== 0) return deptCmp;
    return (pa?.name ?? "").localeCompare(pb?.name ?? "");
  });

  return rows;
}

function hintCountForCategory(
  categoryName: string,
  hints: InsuranceCategoryPositionHint[],
  positionsById: Map<string, Position>,
): number {
  const needle = categoryName.trim().toLowerCase();
  if (!needle) return 0;
  const seen = new Set<string>();
  for (const hint of hints) {
    if (hint.categoryName.trim().toLowerCase() !== needle) continue;
    if (!hint.departmentId || !hint.positionId) continue;
    const pos = positionsById.get(hint.positionId);
    const departmentId = pos?.department_id || hint.departmentId;
    seen.add(`${departmentId}:${hint.positionId}`);
  }
  return seen.size;
}

function draftFromProvider(
  provider: InsuranceProvider | null,
  hints: InsuranceCategoryPositionHint[],
  positionsById: Map<string, Position>,
  fillEmptyFromEmployees: boolean,
): {
  name: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  leadDays: string;
  categories: CategoryDraft[];
} {
  if (!provider) {
    return {
      name: "",
      contactPerson: "",
      contactEmail: "",
      contactPhone: "",
      leadDays: "30",
      categories: [],
    };
  }
  return {
    name: provider.name,
    contactPerson: provider.contact_person,
    contactEmail: provider.contact_email,
    contactPhone: provider.contact_phone,
    leadDays: String(provider.lead_days || 30),
    categories: provider.categories
      .filter((c) => !c.archived_at)
      .map((c) => {
        const existing = c.position_defaults.map((d) => ({
          key: d.id,
          departmentId: d.department_id,
          positionId: d.position_id ?? "",
        }));
        const positionDefaults =
          fillEmptyFromEmployees && existing.length === 0
            ? defaultsFromHints(c.name, hints, positionsById)
            : existing;
        return {
          key: c.id,
          id: c.id,
          name: c.name,
          defaultMedicalValue: c.default_medical_value
            ? String(c.default_medical_value)
            : "",
          positionDefaults,
        };
      }),
  };
}

export function InsuranceProviderDialog({
  provider,
  open,
  onOpenChange,
  onSaved,
  departments,
  positions,
  categoryPositionHints = [],
}: InsuranceProviderDialogProps) {
  const [pending, startTransition] = useTransition();
  const positionsById = useMemo(() => {
    const map = new Map<string, Position>();
    for (const pos of positions) map.set(pos.id, pos);
    return map;
  }, [positions]);

  const initial = useMemo(
    () =>
      draftFromProvider(
        provider,
        categoryPositionHints,
        positionsById,
        true,
      ),
    [provider, categoryPositionHints, positionsById],
  );
  const [name, setName] = useState(initial.name);
  const [contactPerson, setContactPerson] = useState(initial.contactPerson);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone);
  const [leadDays, setLeadDays] = useState(initial.leadDays);
  const [categories, setCategories] = useState(initial.categories);

  useEffect(() => {
    if (!open) return;
    const next = draftFromProvider(
      provider,
      categoryPositionHints,
      positionsById,
      true,
    );
    setName(next.name);
    setContactPerson(next.contactPerson);
    setContactEmail(next.contactEmail);
    setContactPhone(next.contactPhone);
    setLeadDays(next.leadDays);
    setCategories(next.categories);
  }, [open, provider, categoryPositionHints, positionsById]);

  const positionsByDept = useMemo(() => {
    const map = new Map<string, Position[]>();
    for (const pos of positions) {
      const list = map.get(pos.department_id) ?? [];
      list.push(pos);
      map.set(pos.department_id, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
    }
    return map;
  }, [positions]);

  if (!open || typeof document === "undefined") return null;

  function addCategory() {
    setCategories((prev) => [
      ...prev,
      {
        key: newKey(),
        name: "",
        defaultMedicalValue: "",
        positionDefaults: [],
      },
    ]);
  }

  function updateCategory(
    key: string,
    patch: Partial<Omit<CategoryDraft, "key" | "positionDefaults">>,
  ) {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.key !== key) return c;
        const next = { ...c, ...patch };
        // When naming a new/empty category, pull positions from current employee assignments.
        if (
          patch.name !== undefined &&
          c.positionDefaults.length === 0 &&
          patch.name.trim()
        ) {
          const filled = defaultsFromHints(
            patch.name,
            categoryPositionHints,
            positionsById,
          );
          if (filled.length > 0) next.positionDefaults = filled;
        }
        return next;
      }),
    );
  }

  function removeCategory(key: string) {
    setCategories((prev) => prev.filter((c) => c.key !== key));
  }

  function addPositionDefault(categoryKey: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.key === categoryKey
          ? {
              ...c,
              positionDefaults: [
                ...c.positionDefaults,
                { key: newKey(), departmentId: "", positionId: "" },
              ],
            }
          : c,
      ),
    );
  }

  function fillPositionDefaultsFromEmployees(categoryKey: string) {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.key !== categoryKey) return c;
        const filled = defaultsFromHints(
          c.name,
          categoryPositionHints,
          positionsById,
        );
        if (filled.length === 0) {
          toast.error(
            c.name.trim()
              ? `No employees currently assigned to category "${c.name}".`
              : "Enter a category name first.",
          );
          return c;
        }
        toast.saved(
          `Loaded ${filled.length} position${filled.length === 1 ? "" : "s"} from employees in "${c.name}".`,
        );
        return { ...c, positionDefaults: filled };
      }),
    );
  }

  function updatePositionDefault(
    categoryKey: string,
    rowKey: string,
    patch: Partial<Omit<PositionDefaultDraft, "key">>,
  ) {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.key !== categoryKey) return c;
        return {
          ...c,
          positionDefaults: c.positionDefaults.map((row) => {
            if (row.key !== rowKey) return row;
            const next = { ...row, ...patch };
            if (patch.departmentId !== undefined) next.positionId = "";
            return next;
          }),
        };
      }),
    );
  }

  function removePositionDefault(categoryKey: string, rowKey: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.key === categoryKey
          ? {
              ...c,
              positionDefaults: c.positionDefaults.filter(
                (row) => row.key !== rowKey,
              ),
            }
          : c,
      ),
    );
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Provider name is required.");
      return;
    }
    for (const cat of categories) {
      if (!cat.name.trim()) {
        toast.error("Each category needs a name.");
        return;
      }
      for (const row of cat.positionDefaults) {
        if (!row.departmentId) {
          toast.error(`Select a department for category "${cat.name}".`);
          return;
        }
      }
    }

    startTransition(async () => {
      const result = await upsertInsuranceProvider({
        id: provider?.id,
        name,
        contactPerson,
        contactEmail,
        contactPhone,
        leadDays: Number(leadDays) || 30,
        categories: categories.map((cat, index) => ({
          id: cat.id,
          name: cat.name.trim(),
          defaultMedicalValue:
            cat.defaultMedicalValue.trim() === ""
              ? 0
              : Number(cat.defaultMedicalValue) || 0,
          sortOrder: index + 1,
          positionDefaults: cat.positionDefaults.map((row) => ({
            departmentId: row.departmentId,
            positionId: row.positionId || null,
          })),
        })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(provider ? "Provider updated." : "Provider created.");
      onSaved();
      onOpenChange(false);
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="insurance-provider-dialog-title"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="insurance-provider-dialog-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              {provider ? "Edit provider" : "Add provider"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact details, insurance categories, and position defaults.
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ins-provider-name">Provider company</Label>
              <Input
                id="ins-provider-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                placeholder="Insurance company name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-contact">Contact person</Label>
              <Input
                id="ins-contact"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-phone">Contact number</Label>
              <Input
                id="ins-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                disabled={pending}
                placeholder="+971 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-email">Contact email</Label>
              <Input
                id="ins-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                disabled={pending}
                placeholder="provider@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-lead">Reminder lead (days)</Label>
              <Input
                id="ins-lead"
                type="number"
                min={0}
                max={365}
                value={leadDays}
                onChange={(e) => setLeadDays(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-black/10 bg-[#f7f7f2] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#3D421F]">
                  Insurance categories
                </p>
                <p className="text-xs text-black/45">
                  Coverage plans for this provider. Position defaults are filled
                  from employees currently assigned to each category.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-[#3D421F]"
                onClick={addCategory}
                disabled={pending}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {categories.length === 0 ? (
              <p className="text-xs text-black/40">
                No categories yet — add the first coverage plan.
              </p>
            ) : null}

            <div className="space-y-4">
              {categories.map((cat) => {
                const hintCount = hintCountForCategory(
                  cat.name,
                  categoryPositionHints,
                  positionsById,
                );
                return (
                  <div
                    key={cat.key}
                    className="space-y-3 rounded-lg border border-black/10 bg-white p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                      <Input
                        value={cat.name}
                        onChange={(e) =>
                          updateCategory(cat.key, { name: e.target.value })
                        }
                        disabled={pending}
                        placeholder="Category name"
                        aria-label="Category name"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cat.defaultMedicalValue}
                        onChange={(e) =>
                          updateCategory(cat.key, {
                            defaultMedicalValue: e.target.value,
                          })
                        }
                        disabled={pending}
                        placeholder="Value AED"
                        aria-label="Default medical value"
                      />
                      <button
                        type="button"
                        onClick={() => removeCategory(cat.key)}
                        disabled={pending}
                        className="flex h-10 w-10 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-rose-700"
                        aria-label="Remove category"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                          Position defaults
                          {cat.positionDefaults.length > 0 ? (
                            <span className="ml-1.5 font-normal normal-case tracking-normal text-black/35">
                              ({cat.positionDefaults.length})
                            </span>
                          ) : null}
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-[#3D421F]"
                            onClick={() =>
                              fillPositionDefaultsFromEmployees(cat.key)
                            }
                            disabled={pending || hintCount === 0}
                            title={
                              hintCount === 0
                                ? "No employees currently in this category"
                                : `Load ${hintCount} position${hintCount === 1 ? "" : "s"} from employees`
                            }
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                            From employees
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-[#3D421F]"
                            onClick={() => addPositionDefault(cat.key)}
                            disabled={pending}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Position
                          </Button>
                        </div>
                      </div>
                      {cat.positionDefaults.length === 0 ? (
                        <p className="text-[11px] text-black/35">
                          No position defaults — use From employees or add
                          positions manually.
                        </p>
                      ) : null}
                      {cat.positionDefaults.map((row) => {
                        const deptPositions = row.departmentId
                          ? (positionsByDept.get(row.departmentId) ?? [])
                          : [];
                        return (
                          <div
                            key={row.key}
                            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                          >
                            <select
                              className={selectClass}
                              value={row.departmentId}
                              onChange={(e) =>
                                updatePositionDefault(cat.key, row.key, {
                                  departmentId: e.target.value,
                                })
                              }
                              disabled={pending}
                              aria-label="Department"
                            >
                              <option value="">Select department</option>
                              {departments.map((dept) => (
                                <option key={dept.id} value={dept.id}>
                                  {dept.name}
                                </option>
                              ))}
                            </select>
                            <select
                              className={selectClass}
                              value={row.positionId}
                              onChange={(e) =>
                                updatePositionDefault(cat.key, row.key, {
                                  positionId: e.target.value,
                                })
                              }
                              disabled={pending || !row.departmentId}
                              aria-label="Position"
                            >
                              <option value="">All positions</option>
                              {deptPositions.map((pos) => (
                                <option key={pos.id} value={pos.id}>
                                  {pos.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                removePositionDefault(cat.key, row.key)
                              }
                              disabled={pending}
                              className="flex h-10 w-10 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-rose-700"
                              aria-label="Remove position default"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-4">
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
