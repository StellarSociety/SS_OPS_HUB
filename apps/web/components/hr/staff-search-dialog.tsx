"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { StatusBadge } from "@/components/hr/status-badge";
import type {
  Department,
  EmploymentStatus,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

/** Status selected by default when the dialog opens. */
const DEFAULT_STATUS_NAME = "ON Board";

type StaffSearchDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (staff: StaffWithLookups) => void;
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
};

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

const chipClass = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active
      ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15 text-[#3D421F]"
      : "border-black/10 bg-white text-black/55 hover:bg-black/[0.03] hover:text-[#3D421F]",
  );

export function StaffSearchDialog({
  open,
  onClose,
  onSelect,
  staff,
  departments,
  positions,
  statuses,
}: StaffSearchDialogProps) {
  const defaultStatusIds = useMemo(() => {
    const match = statuses.find(
      (s) => s.name.toLowerCase() === DEFAULT_STATUS_NAME.toLowerCase(),
    );
    return new Set<string>(match ? [match.id] : []);
  }, [statuses]);

  const [name, setName] = useState("");
  const [deptIds, setDeptIds] = useState<Set<string>>(new Set());
  const [posIds, setPosIds] = useState<Set<string>>(new Set());
  const [statusIds, setStatusIds] = useState<Set<string>>(defaultStatusIds);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const visiblePositions = useMemo(
    () =>
      deptIds.size
        ? positions.filter((p) => deptIds.has(p.department_id))
        : positions,
    [positions, deptIds],
  );

  const results = useMemo(() => {
    const q = name.trim().toLowerCase();
    return staff.filter((s) => {
      if (
        statusIds.size &&
        !(s.employment_status_id && statusIds.has(s.employment_status_id))
      )
        return false;
      if (deptIds.size && !(s.department_id && deptIds.has(s.department_id)))
        return false;
      if (posIds.size && !(s.position_id && posIds.has(s.position_id)))
        return false;
      if (
        q &&
        !(
          s.full_name.toLowerCase().includes(q) ||
          s.emp_no.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [staff, name, deptIds, posIds, statusIds]);

  if (!open) return null;

  const statusIsDefault =
    statusIds.size === defaultStatusIds.size &&
    [...statusIds].every((id) => defaultStatusIds.has(id));
  const hasFilters =
    name.trim() !== "" ||
    deptIds.size > 0 ||
    posIds.size > 0 ||
    !statusIsDefault;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Search employees"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <h2 className="font-serif text-lg text-[#3D421F]">Search employee</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/50 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-4 border-b border-black/10 px-5 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <input
              autoFocus
              placeholder="Search by name or employee no…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-md border border-black/10 bg-white pl-10 pr-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/45">
              Department
            </p>
            <div className="flex flex-wrap gap-2">
              {departments.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDeptIds((s) => toggle(s, d.id));
                    setPosIds(new Set());
                  }}
                  className={chipClass(deptIds.has(d.id))}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/45">
              Position
            </p>
            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {visiblePositions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPosIds((s) => toggle(s, p.id))}
                  className={chipClass(posIds.has(p.id))}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/45">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatusIds((prev) => toggle(prev, s.id))}
                  className={chipClass(statusIds.has(s.id))}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setName("");
                setDeptIds(new Set());
                setPosIds(new Set());
                setStatusIds(new Set(defaultStatusIds));
              }}
              className="text-xs font-medium text-black/45 underline-offset-2 hover:text-[#3D421F] hover:underline"
            >
              Clear all filters
            </button>
          ) : null}
        </div>

        {/* Results */}
        <div className="max-h-[40vh] overflow-y-auto px-5 py-3">
          <p className="mb-2 text-sm text-black/50">
            {results.length} of {staff.length} employee
            {staff.length === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-black/5">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-[var(--venue-secondary)]/40"
                >
                  <span className="w-14 shrink-0 font-mono text-xs text-black/45">
                    {s.emp_no}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[#3D421F]">
                      {s.full_name}
                    </span>
                    <span className="block truncate text-xs text-black/50">
                      {[s.department?.name, s.position?.name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </span>
                  <StatusBadge status={s.employment_status?.name} />
                </button>
              </li>
            ))}
          </ul>
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-black/50">
              No employees match your search.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
