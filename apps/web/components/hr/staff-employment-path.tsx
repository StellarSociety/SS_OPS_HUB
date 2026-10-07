"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StaffEmploymentPathPay } from "@/components/hr/staff-employment-path-pay";
import { StaffPathNoteDialog } from "@/components/hr/staff-path-note-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "@/components/ui/toast";
import {
  deleteStaffPathNote,
  listStaffPathNotes,
  type StaffPathNoteItem,
} from "@/lib/actions/hr-staff-path-notes";
import {
  ChangePathRow,
  type PositionSalaryDeletedPatch,
  EmploymentStartedMarker,
  resolveStartingEmployment,
  StaffEmploymentPathPositionSalary,
} from "@/components/hr/staff-employment-path-position-salary";
import {
  listStaffPositionSalaryChanges,
  type StaffPositionSalaryChangeItem,
} from "@/lib/actions/hr-staff-position-salary";
import {
  getStaffEmploymentPathLifecycle,
  type StaffEmploymentPathLifecycle,
} from "@/lib/actions/hr-offboarding";
import { formatDateOnly, type SalaryPercentages } from "@/lib/hr/derived";
import {
  STAFF_TERMINATION_TYPE_OPTIONS,
  type Department,
  type Position,
} from "@/lib/hr/types";
import {
  segmentedSubNavLinkClass,
  segmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

export const EMPLOYMENT_PATH_SUBTABS = [
  "path",
  "position_salary",
  "disciplinary",
  "pay",
] as const;

export type EmploymentPathSubtab = (typeof EMPLOYMENT_PATH_SUBTABS)[number];

const SUBTAB_LABELS: Record<EmploymentPathSubtab, string> = {
  path: "Path",
  position_salary: "Position / Salary",
  disciplinary: "Disciplinary",
  pay: "Pay",
};

const changesInFlight = new Map<
  string,
  ReturnType<typeof listStaffPositionSalaryChanges>
>();

function loadPositionSalaryChanges(staffId: string) {
  const existing = changesInFlight.get(staffId);
  if (existing) return existing;
  const request = listStaffPositionSalaryChanges(staffId).finally(() => {
    changesInFlight.delete(staffId);
  });
  changesInFlight.set(staffId, request);
  return request;
}

type StaffEmploymentPathProps = {
  staffId?: string | null;
  joiningDate?: string | null;
  terminationDate?: string | null;
  terminationType?: string | null;
  canViewSalary?: boolean;
  canEdit?: boolean;
  departments?: Department[];
  positions?: Position[];
  currentDepartmentId?: string;
  currentPositionId?: string;
  currentWagePackage?: string;
  currentCompanyAccommodation?: string;
  currentVisaStatus?: string;
  currentVisaExpiry?: string;
  salaryPct?: SalaryPercentages;
  onPositionSalaryApplied?: (patch: {
    department_id?: string;
    position_id?: string;
    wage_package?: string;
    company_accommodation?: string;
    visa_status?: string;
    visa_expiry?: string;
  }) => void;
  className?: string;
};

function PlaceholderPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-serif text-lg text-[#3D421F]">{title}</h3>
          <p className="text-sm leading-relaxed text-black/50">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function exitKindLabel(kind: string | null | undefined): string {
  if (kind === "resignation") return "Resignation";
  if (kind === "termination_with_notice") return "Termination with notice";
  if (kind === "immediate_termination" || kind === "termination") {
    return "Immediate termination";
  }
  const match = STAFF_TERMINATION_TYPE_OPTIONS.find(
    (opt) => opt.value === kind,
  );
  return match?.label ?? "Employment ended";
}

function exitNodeClass(kind: string | null | undefined): string {
  return kind === "resignation" ? "bg-amber-500" : "bg-red-600";
}

type PathLifecycleEvent = {
  id: string;
  date: string;
  createdAt: string;
  title: string;
  subtitle?: string;
  nodeClass: string;
  change?: StaffPositionSalaryChangeItem;
  note?: StaffPathNoteItem;
};

function lifecycleEventsFrom(
  lifecycle: StaffEmploymentPathLifecycle | null,
  terminationDate: string | null,
  terminationType: string | null,
  changes: StaffPositionSalaryChangeItem[],
  notes: StaffPathNoteItem[] = [],
): PathLifecycleEvent[] {
  const events: PathLifecycleEvent[] = changes.map((item) => ({
    id: item.id,
    date: item.effectiveDate,
    createdAt: item.createdAt,
    title: "",
    nodeClass: "bg-[var(--venue-primary,#6B7B3A)]",
    change: item,
  }));
  for (const note of notes) {
    events.push({
      id: `note-${note.id}`,
      date: note.noteDate,
      createdAt: note.createdAt,
      title: "",
      nodeClass: "bg-amber-500",
      note,
    });
  }

  const offboarding = lifecycle?.offboarding;
  if (offboarding) {
    if (offboarding.notificationDate) {
      events.push({
        id: `ob-notice-${offboarding.notificationDate}`,
        date: offboarding.notificationDate,
        createdAt: `${offboarding.notificationDate}T12:00:00.000Z`,
        title: exitKindLabel(offboarding.kind),
        subtitle:
          offboarding.kind === "resignation"
            ? "Resignation notified"
            : "Termination notification given",
        nodeClass: exitNodeClass(offboarding.kind),
      });
    }
    if (offboarding.lastWorkingDay) {
      events.push({
        id: `ob-lwd-${offboarding.lastWorkingDay}`,
        date: offboarding.lastWorkingDay,
        createdAt: `${offboarding.lastWorkingDay}T18:00:00.000Z`,
        title: "Last working day",
        subtitle: exitKindLabel(offboarding.kind),
        nodeClass: "bg-red-600",
      });
    }
  } else if (terminationDate) {
    events.push({
      id: `term-${terminationDate}`,
      date: terminationDate,
      createdAt: `${terminationDate}T18:00:00.000Z`,
      title: exitKindLabel(terminationType),
      subtitle: "Employment ended",
      nodeClass: exitNodeClass(terminationType),
    });
  }

  const visaCancelDate = lifecycle?.visaCancelDate ?? null;
  if (visaCancelDate) {
    events.push({
      id: `visa-cancel-${visaCancelDate}`,
      date: visaCancelDate,
      createdAt: `${visaCancelDate}T20:00:00.000Z`,
      title: "Visa canceled",
      subtitle: "Visa cancelation",
      nodeClass: "bg-red-600",
    });
  }

  return events.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function PathOverview({
  staffId,
  joiningDate,
  terminationDate,
  terminationType,
  canViewSalary,
  canEdit,
  salaryPct,
  items,
  lifecycle,
  loading,
  departments,
  positions,
  currentDepartmentId,
  currentPositionId,
  currentWagePackage,
  currentCompanyAccommodation,
  onEditItem,
  onDeletedItem,
}: {
  staffId: string | null;
  joiningDate: string | null;
  terminationDate: string | null;
  terminationType: string | null;
  canViewSalary: boolean;
  canEdit: boolean;
  salaryPct: SalaryPercentages;
  items: StaffPositionSalaryChangeItem[];
  lifecycle: StaffEmploymentPathLifecycle | null;
  loading: boolean;
  departments: Department[];
  positions: Position[];
  currentDepartmentId: string;
  currentPositionId: string;
  currentWagePackage: string;
  currentCompanyAccommodation: string;
  onEditItem?: (item: StaffPositionSalaryChangeItem) => void;
  onDeletedItem?: (
    item: StaffPositionSalaryChangeItem,
    staffPatch: PositionSalaryDeletedPatch,
  ) => void;
}) {
  const [notes, setNotes] = useState<StaffPathNoteItem[]>([]);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<StaffPathNoteItem | null>(
    null,
  );
  const [noteToDelete, setNoteToDelete] = useState<StaffPathNoteItem | null>(
    null,
  );
  const [deletingNote, setDeletingNote] = useState(false);
  const [noteDeleteError, setNoteDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    void listStaffPathNotes(staffId).then((result) => {
      if (cancelled) return;
      if (result.ok) setNotes(result.items);
      else console.error("[hr] list path notes:", result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  async function confirmDeleteNote() {
    const note = noteToDelete;
    if (!staffId || !note) return;
    setDeletingNote(true);
    setNoteDeleteError(null);
    const result = await deleteStaffPathNote({ staffId, noteId: note.id });
    setDeletingNote(false);
    if (!result.ok) {
      setNoteDeleteError(result.error);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    setNoteToDelete(null);
    toast.saved("Note deleted.");
  }

  const pending = loading;
  const startingEmployment = resolveStartingEmployment({
    items,
    positions,
    departments,
    currentPositionId,
    currentDepartmentId,
    currentWagePackage,
    currentCompanyAccommodation,
  });

  const recentFirst = lifecycleEventsFrom(
    lifecycle,
    terminationDate,
    terminationType,
    items,
    staffId ? notes : [],
  );

  return (
    <PlaceholderPanel
      title="Employment path"
      description="History of this employee — newest events first, start date at the bottom."
      action={
        canEdit && staffId ? (
          <button
            type="button"
            onClick={() => {
              setEditingNote(null);
              setNoteDialogOpen(true);
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 px-3 text-sm font-medium text-[#3D421F] transition hover:bg-[var(--venue-primary)]/20"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add Notes
          </button>
        ) : null
      }
    >
      <ConfirmDeleteDialog
        open={noteToDelete != null}
        title="Delete this note?"
        description="The note is removed from this employee's Employment path."
        subject={
          noteToDelete ? (
            <div className="space-y-1">
              <p className="font-medium tabular-nums">
                {formatDateOnly(noteToDelete.noteDate)}
              </p>
              <p className="line-clamp-4 whitespace-pre-wrap text-black/60">
                {noteToDelete.body}
              </p>
            </div>
          ) : null
        }
        confirmLabel="Delete note"
        pending={deletingNote}
        error={noteDeleteError}
        onClose={() => setNoteToDelete(null)}
        onConfirm={() => void confirmDeleteNote()}
      />

      {noteDialogOpen && staffId ? (
        <StaffPathNoteDialog
          staffId={staffId}
          editingNote={editingNote}
          onClose={() => {
            setNoteDialogOpen(false);
            setEditingNote(null);
          }}
          onSaved={(item) =>
            setNotes((prev) => [item, ...prev.filter((n) => n.id !== item.id)])
          }
        />
      ) : null}

      {!staffId ? (
        <p className="text-sm text-black/45">
          Save this employee to build their employment path.
        </p>
      ) : null}

      {staffId && pending && recentFirst.length === 0 && !joiningDate ? (
        <div className="flex items-center gap-2 py-6 text-sm text-black/50">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading path…
        </div>
      ) : null}

      {staffId ? (
        <ul className="relative ml-1.5 space-y-3 border-l border-black/10">
          {recentFirst.map((event) => {
            const item = event.change;
            if (item) {
              return (
                <ChangePathRow
                  key={item.id}
                  item={item}
                  canViewSalary={canViewSalary}
                  canEdit={canEdit}
                  salaryPct={salaryPct}
                  onEdit={onEditItem}
                  staffId={staffId}
                  onDeleted={onDeletedItem}
                />
              );
            }

            const note = event.note;
            if (note) {
              return (
                <li key={event.id} className="relative pl-6">
                  <span
                    className={cn(
                      "absolute left-0 top-3 size-2.5 rounded-full border-2 border-white shadow-sm ring-1 ring-black/10",
                      event.nodeClass,
                    )}
                    aria-hidden
                  />
                  <div className="rounded-lg border border-black/8 bg-white/70 px-3 py-3 sm:px-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium tabular-nums text-[#3D421F]">
                          {formatDateOnly(note.noteDate)}
                        </span>
                        <span className="inline-flex rounded border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                          Note
                        </span>
                      </div>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNote(note);
                              setNoteDialogOpen(true);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#3D421F] transition hover:bg-[var(--venue-primary)]/10"
                          >
                            <Pencil className="h-3 w-3" aria-hidden />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNoteDeleteError(null);
                              setNoteToDelete(note);
                            }}
                            title="Delete this note"
                            aria-label="Delete this note"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-black/40 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#3D421F]">
                      {note.body}
                    </p>
                  </div>
                </li>
              );
            }

            return (
              <li key={event.id} className="relative pl-6">
                <span
                  className={cn(
                    "absolute left-0 top-3 size-2.5 rounded-full border-2 border-white shadow-sm ring-1 ring-black/10",
                    event.nodeClass,
                  )}
                  aria-hidden
                />
                <div className="rounded-lg border border-black/8 bg-white/70 px-3 py-3">
                  <p className="text-sm font-medium tabular-nums text-[#3D421F]">
                    {formatDateOnly(event.date)}
                  </p>
                  <p className="mt-1 text-sm text-[#3D421F]">{event.title}</p>
                  {event.subtitle ? (
                    <p className="mt-1 text-xs text-black/50">
                      {event.subtitle}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}

          {joiningDate ? (
            <EmploymentStartedMarker
              joiningDate={joiningDate}
              start={startingEmployment}
              canViewSalary={canViewSalary}
              salaryPct={salaryPct}
            />
          ) : null}

          {!pending && recentFirst.length === 0 && !joiningDate ? (
            <li className="pl-6 text-sm text-black/45">No path events yet.</li>
          ) : null}
        </ul>
      ) : null}

      <p className="text-xs text-black/40">
        Resignation, termination, and visa cancelation come from Off-boarding
        and Visa. Add position and salary changes under Position / Salary.
      </p>
    </PlaceholderPanel>
  );
}

export function StaffEmploymentPath({
  staffId = null,
  joiningDate = null,
  terminationDate = null,
  terminationType = null,
  canViewSalary = false,
  canEdit = false,
  departments = [],
  positions = [],
  currentDepartmentId = "",
  currentPositionId = "",
  currentWagePackage = "",
  currentCompanyAccommodation = "No",
  currentVisaStatus = "",
  currentVisaExpiry = "",
  salaryPct = { basic: 60, accom: 25, transp: 15 },
  onPositionSalaryApplied,
  className,
}: StaffEmploymentPathProps) {
  const [subtab, setSubtab] = useState<EmploymentPathSubtab>("path");
  const [editFromPathId, setEditFromPathId] = useState<string | null>(null);
  const [items, setItems] = useState<StaffPositionSalaryChangeItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(Boolean(staffId));
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] =
    useState<StaffEmploymentPathLifecycle | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!staffId) {
      setItems([]);
      setItemsError(null);
      setItemsLoading(false);
      setLifecycle(null);
      setLifecycleLoading(false);
      return;
    }

    let cancelled = false;
    setItemsLoading(true);
    setItemsError(null);

    // Kick off the history list first. Next.js serializes server actions, so
    // the Position / Salary tab must not wait behind visa/offboarding lookups.
    void loadPositionSalaryChanges(staffId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setItems([]);
          setItemsError(result.error);
          return;
        }
        setItems(result.items);
        setItemsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setItemsError(
          err instanceof Error ? err.message : "Could not load history.",
        );
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [staffId, reloadToken]);

  useEffect(() => {
    if (!staffId || subtab !== "path" || itemsLoading) {
      if (subtab !== "path") setLifecycleLoading(false);
      return;
    }
    let cancelled = false;
    setLifecycleLoading(true);
    void getStaffEmploymentPathLifecycle(staffId)
      .then((extras) => {
        if (cancelled) return;
        setLifecycle(extras.ok ? extras.lifecycle : null);
      })
      .catch(() => {
        if (cancelled) return;
        setLifecycle(null);
      })
      .finally(() => {
        if (!cancelled) setLifecycleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId, subtab, itemsLoading]);

  return (
    <div className={cn("space-y-4", className)}>
      <nav
        aria-label="Employment path sections"
        className={segmentedSubNavShellClass}
        role="tablist"
      >
        {EMPLOYMENT_PATH_SUBTABS.map((id) => {
          const active = subtab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubtab(id)}
              className={segmentedSubNavLinkClass(active)}
            >
              <span className="min-w-0 truncate">{SUBTAB_LABELS[id]}</span>
            </button>
          );
        })}
      </nav>

      {subtab === "path" ? (
        <PathOverview
          staffId={staffId}
          joiningDate={joiningDate}
          terminationDate={terminationDate}
          terminationType={terminationType}
          canViewSalary={canViewSalary}
          canEdit={canEdit}
          salaryPct={salaryPct}
          items={items}
          lifecycle={lifecycle}
          loading={itemsLoading || lifecycleLoading}
          departments={departments}
          positions={positions}
          currentDepartmentId={currentDepartmentId}
          currentPositionId={currentPositionId}
          currentWagePackage={currentWagePackage}
          currentCompanyAccommodation={currentCompanyAccommodation}
          onEditItem={
            canEdit
              ? (item) => {
                  setEditFromPathId(item.id);
                  setSubtab("position_salary");
                }
              : undefined
          }
          onDeletedItem={(deleted, staffPatch) => {
            setItems((prev) => prev.filter((row) => row.id !== deleted.id));
            if (staffPatch) onPositionSalaryApplied?.(staffPatch);
          }}
        />
      ) : null}

      {subtab === "position_salary" ? (
        <StaffEmploymentPathPositionSalary
          staffId={staffId}
          canViewSalary={canViewSalary}
          canEdit={canEdit}
          departments={departments}
          positions={positions}
          currentDepartmentId={currentDepartmentId}
          currentPositionId={currentPositionId}
          currentWagePackage={currentWagePackage}
          currentCompanyAccommodation={currentCompanyAccommodation}
          currentVisaStatus={currentVisaStatus}
          currentVisaExpiry={currentVisaExpiry}
          salaryPct={salaryPct}
          items={items}
          loading={itemsLoading}
          error={itemsError}
          onRetry={() => {
            if (staffId) changesInFlight.delete(staffId);
            setReloadToken((n) => n + 1);
          }}
          onItemsChange={setItems}
          onApplied={onPositionSalaryApplied}
          openEditChangeId={editFromPathId}
          onOpenEditChangeIdConsumed={() => setEditFromPathId(null)}
        />
      ) : null}

      {subtab === "disciplinary" ? (
        <PlaceholderPanel
          title="Disciplinary actions"
          description="Record and review disciplinary actions in chronological order."
        >
          <p className="text-sm text-black/45">No actions recorded yet.</p>
        </PlaceholderPanel>
      ) : null}

      {subtab === "pay" ? (
        <StaffEmploymentPathPay
          staffId={staffId}
          canViewSalary={canViewSalary}
        />
      ) : null}
    </div>
  );
}
