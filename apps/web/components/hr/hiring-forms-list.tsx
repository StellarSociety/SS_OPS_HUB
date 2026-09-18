"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, CopyPlus, Globe, Plus, Trash2 } from "lucide-react";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { toast } from "@/components/ui/toast";
import { HiringDialog } from "@/components/hr/hiring-dialog";
import {
  createHiringForm,
  duplicateHiringForm,
  purgeHiringFormData,
  saveHiringForm,
} from "@/lib/actions/hr-hiring";
import {
  formatHiringPositionNames,
  hiringApplyPath,
  HIRING_COPY_POSITIONS_TOKEN,
  HIRING_FORM_STATUS_LABELS,
  type HiringForm,
  type HiringFormStatus,
} from "@/lib/hr/hiring/types";
import type { Department, Position } from "@/lib/hr/types";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { cn } from "@/lib/utils";

function publicApplyUrl(code: string): string {
  return `${window.location.origin}${hiringApplyPath(code)}`;
}

function hiringStatusTagClass(status: HiringFormStatus): string {
  if (status === "live") return "border-green-200 bg-green-100 text-green-800";
  if (status === "scheduled") {
    return "border-amber-200 bg-amber-100 text-amber-800";
  }
  return "border-black/10 bg-black/10 text-black/65";
}

const EMPTY_DELETE_TARGETS = {
  form: false,
  allEntries: false,
  nonShortlisted: false,
  shortlisted: false,
};

export function HiringFormsList({
  forms,
  departments,
  positions,
  canEdit,
}: {
  forms: HiringForm[];
  departments: Department[];
  positions: Position[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [positionsForm, setPositionsForm] = useState<HiringForm | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [deleteForm, setDeleteForm] = useState<HiringForm | null>(null);
  const [deleteTargets, setDeleteTargets] = useState(EMPTY_DELETE_TARGETS);

  const departmentPositions = useMemo(
    () =>
      departmentId
        ? positions.filter((position) => position.department_id === departmentId)
        : [],
    [departmentId, positions],
  );
  const positionsPreview = formatHiringPositionNames(
    positionIds
      .map(
        (id) =>
          departmentPositions.find((position) => position.id === id)?.name ?? "",
      )
      .filter(Boolean),
  );

  function openPositionsDialog(form: HiringForm) {
    setPositionsForm(form);
    setDepartmentId(form.intro2_department_id ?? "");
    setPositionIds([...form.intro2_position_ids]);
  }

  function openDeleteDialog(form: HiringForm) {
    setDeleteForm(form);
    setDeleteTargets(EMPTY_DELETE_TARGETS);
  }

  function closeDeleteDialog() {
    if (pending) return;
    setDeleteForm(null);
    setDeleteTargets(EMPTY_DELETE_TARGETS);
  }

  const formIncluded = deleteTargets.form;
  const allEntriesIncluded = formIncluded || deleteTargets.allEntries;
  const nonShortlistedIncluded =
    allEntriesIncluded || deleteTargets.nonShortlisted;
  const shortlistedIncluded = allEntriesIncluded || deleteTargets.shortlisted;
  const hasDeleteSelection =
    deleteTargets.form ||
    deleteTargets.allEntries ||
    deleteTargets.nonShortlisted ||
    deleteTargets.shortlisted;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/55">
          Build public application forms, then share a short link or QR code.
        </p>
        {canEdit ? (
          <Button
            type="button"
            onClick={() => {
              setName("");
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New form
          </Button>
        ) : null}
      </div>

      {forms.length === 0 ? (
        <Card className="px-6 py-16 text-center text-sm text-muted-foreground">
          No hiring forms yet. Create one to start collecting applicants.
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <Card
              key={form.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="font-serif text-xl text-[#3D421F]">{form.name}</h2>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    hiringStatusTagClass(form.status),
                  )}
                >
                  {HIRING_FORM_STATUS_LABELS[form.status]}
                </span>
                {form.max_entries ? (
                  <span className="text-xs text-black/45">
                    max {form.max_entries}
                  </span>
                ) : null}
                <span className="rounded-full bg-[var(--venue-primary,#818a40)]/12 px-2.5 py-1 text-xs font-medium text-[#3D421F]">
                  {form.application_count ?? 0} replies
                </span>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
                  title={`Edit positions for ${HIRING_COPY_POSITIONS_TOKEN}`}
                  aria-label={`Edit available positions for ${form.name}`}
                  disabled={pending}
                  onClick={() => openPositionsDialog(form)}
                >
                  <Briefcase className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <ScopedLink
                  href={`/hr/hiring/forms/${form.id}`}
                  className="inline-flex h-9 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-3 text-sm font-medium text-white"
                >
                  Open builder
                </ScopedLink>
                <ScopedLink
                  href={`/hr/hiring/replies/${form.id}`}
                  className="inline-flex h-9 items-center rounded-md border border-black/10 px-3 text-sm text-[#3D421F] hover:bg-black/5"
                >
                  Replies
                </ScopedLink>
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-md border border-black/10 px-2.5 text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
                    title="Duplicate form"
                    aria-label={`Duplicate ${form.name}`}
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await duplicateHiringForm(form.id);
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        toast.saved("Form duplicated.");
                        router.push(
                          toScopedHref(
                            `/hr/hiring/forms/${result.id}`,
                            scope,
                            slug,
                          ),
                        );
                      });
                    }}
                  >
                    <CopyPlus className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-md border border-black/10 px-2.5 text-[#3D421F] hover:bg-black/5"
                  title="Copy public form link"
                  aria-label={`Copy public form link for ${form.name}`}
                  onClick={async () => {
                    const url = publicApplyUrl(form.public_code);
                    try {
                      await navigator.clipboard.writeText(url);
                    } catch {
                      toast.error("Could not copy the public form link.");
                      return;
                    }
                    setCopiedId(form.id);
                    toast.saved("Public form link copied.");
                    window.setTimeout(() => {
                      setCopiedId((current) =>
                        current === form.id ? null : current,
                      );
                    }, 1800);
                  }}
                >
                  {copiedId === form.id ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <Globe className="h-4 w-4" aria-hidden />
                  )}
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-md px-2 text-black/40 hover:bg-red-50 hover:text-red-700"
                    onClick={() => openDeleteDialog(form)}
                    aria-label={`Delete data for ${form.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <HiringDialog
        open={createOpen}
        title="New hiring form"
        description="Give the form a name. You can change every section afterwards."
        onClose={() => setCreateOpen(false)}
        busy={pending}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await createHiringForm(name);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.saved("Form created.");
                  setCreateOpen(false);
                  router.push(
                    toScopedHref(`/hr/hiring/forms/${result.id}`, scope, slug),
                  );
                });
              }}
            >
              {pending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Kitchen team 2026"
          disabled={pending}
        />
      </HiringDialog>

      <HiringDialog
        open={Boolean(positionsForm)}
        title="Available positions"
        description={`These roles fill ${HIRING_COPY_POSITIONS_TOKEN} on the public intro, listed with commas.`}
        onClose={() => {
          if (pending) return;
          setPositionsForm(null);
        }}
        busy={pending}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setPositionsForm(null)}
            >
              Cancel
            </Button>
            {canEdit ? (
              <Button
                type="button"
                disabled={pending || !positionsForm}
                onClick={() => {
                  if (!positionsForm) return;
                  startTransition(async () => {
                    const result = await saveHiringForm(positionsForm.id, {
                      intro2_department_id: departmentId || null,
                      intro2_position_ids: positionIds,
                    });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.saved("Positions updated.");
                    setPositionsForm(null);
                    router.refresh();
                  });
                }}
              >
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="quick-positions-department">Department</Label>
          <SearchableSelect
            id="quick-positions-department"
            value={departmentId}
            onChange={(next) => {
              setDepartmentId(next);
              setPositionIds((current) =>
                current.filter((id) =>
                  positions.some(
                    (position) =>
                      position.id === id && position.department_id === next,
                  ),
                ),
              );
            }}
            options={departments.map((department) => ({
              value: department.id,
              label: department.name,
            }))}
            placeholder="Select department"
            searchPlaceholder="Search department…"
            disabled={!canEdit || pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quick-positions">Positions</Label>
          <SearchableMultiSelect
            id="quick-positions"
            values={positionIds}
            onChange={setPositionIds}
            options={departmentPositions.map((position) => ({
              value: position.id,
              label: position.name,
            }))}
            placeholder={
              departmentId
                ? "Select positions"
                : "Choose a department first"
            }
            searchPlaceholder="Search position…"
            disabled={!canEdit || pending || !departmentId}
            aria-label="Open positions"
          />
        </div>
        <p className="text-sm text-black/55">
          {positionsPreview
            ? `${HIRING_COPY_POSITIONS_TOKEN} will show “${positionsPreview}”.`
            : `${HIRING_COPY_POSITIONS_TOKEN} is empty until you select positions.`}
        </p>
      </HiringDialog>

      <HiringDialog
        open={Boolean(deleteForm)}
        title="What do you want to delete?"
        description={`Choose one or more items for “${deleteForm?.name ?? "this form"}”. This action is irreversible.`}
        onClose={closeDeleteDialog}
        busy={pending}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={closeDeleteDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !hasDeleteSelection}
              className="bg-red-700 text-white hover:bg-red-800 hover:opacity-100"
              onClick={() => {
                if (!deleteForm || !hasDeleteSelection) return;
                startTransition(async () => {
                  const result = await purgeHiringFormData(deleteForm.id, {
                    form: deleteTargets.form,
                    allEntries: deleteTargets.allEntries,
                    nonShortlisted: deleteTargets.nonShortlisted,
                    shortlisted: deleteTargets.shortlisted,
                  });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  if (result.deletedForm) {
                    toast.saved("Form deleted.");
                  } else if (result.deletedApplications > 0) {
                    toast.saved(
                      result.deletedApplications === 1
                        ? "1 candidate deleted."
                        : `${result.deletedApplications} candidates deleted.`,
                    );
                  } else {
                    toast.saved("Nothing matched the selected filters.");
                  }
                  setDeleteForm(null);
                  setDeleteTargets(EMPTY_DELETE_TARGETS);
                  router.refresh();
                });
              }}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
              formIncluded
                ? "border-red-200 bg-red-50/70"
                : "border-black/10 bg-white/70",
            )}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={formIncluded}
              disabled={pending}
              onChange={(event) =>
                setDeleteTargets((current) => ({
                  ...current,
                  form: event.target.checked,
                }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-[#3D421F]">
                Delete form
              </span>
              <span className="mt-0.5 block text-xs text-black/50">
                Removes the builder, public link, and every related candidate.
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3",
              allEntriesIncluded
                ? "border-red-200 bg-red-50/70"
                : "border-black/10 bg-white/70",
              formIncluded ? "cursor-not-allowed opacity-70" : "cursor-pointer",
            )}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={allEntriesIncluded}
              disabled={pending || formIncluded}
              onChange={(event) =>
                setDeleteTargets((current) => ({
                  ...current,
                  allEntries: event.target.checked,
                }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-[#3D421F]">
                Delete all entry forms
              </span>
              <span className="mt-0.5 block text-xs text-black/50">
                Removes every submitted application. The form itself stays.
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3",
              nonShortlistedIncluded
                ? "border-red-200 bg-red-50/70"
                : "border-black/10 bg-white/70",
              allEntriesIncluded
                ? "cursor-not-allowed opacity-70"
                : "cursor-pointer",
            )}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={nonShortlistedIncluded}
              disabled={pending || allEntriesIncluded}
              onChange={(event) =>
                setDeleteTargets((current) => ({
                  ...current,
                  nonShortlisted: event.target.checked,
                }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-[#3D421F]">
                Delete non-shortlisted candidates
              </span>
              <span className="mt-0.5 block text-xs text-black/50">
                Applicants who are not on the shortlist.
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3",
              shortlistedIncluded
                ? "border-red-200 bg-red-50/70"
                : "border-black/10 bg-white/70",
              allEntriesIncluded
                ? "cursor-not-allowed opacity-70"
                : "cursor-pointer",
            )}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={shortlistedIncluded}
              disabled={pending || allEntriesIncluded}
              onChange={(event) =>
                setDeleteTargets((current) => ({
                  ...current,
                  shortlisted: event.target.checked,
                }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-[#3D421F]">
                Delete shortlisted candidates
              </span>
              <span className="mt-0.5 block text-xs text-black/50">
                Applicants in Final Assessment or To be Hired.
              </span>
            </span>
          </label>
        </div>
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          This cannot be undone. Deleted forms, candidates, files, and
          appointments cannot be recovered.
        </p>
      </HiringDialog>
    </div>
  );
}
