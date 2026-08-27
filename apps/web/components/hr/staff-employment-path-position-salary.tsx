"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, Pencil, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/components/ui/toast";
import { PayrollMonthPicker } from "@/components/hr/payroll-month-picker";
import {
  createStaffPositionSalaryChange,
  listStaffPositionSalaryChanges,
  updateStaffPositionSalaryChange,
  type StaffPositionSalaryChangeItem,
} from "@/lib/actions/hr-staff-position-salary";
import {
  computeSalaryBreakdown,
  formatAed,
  formatDateOnly,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import type { Department, Position } from "@/lib/hr/types";
import { normalizeVisaStatusLabel, VISA_STATUS_OPTIONS } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

/** Snap any ISO date to the first day of its calendar month. */
function toMonthStartIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso.trim());
  if (!m) return "";
  return `${m[1]}-${m[2]}-01`;
}

function monthInputValue(iso: string): string {
  const m = /^(\d{4}-\d{2})/.exec(iso.trim());
  return m ? m[1] : "";
}

function accommodationPhrase(flag: string | null | undefined): string {
  return flag === "Yes" ? "with Company Accommodation Provided" : "";
}

export type StartingEmployment = {
  positionName: string;
  departmentName: string;
  wagePackage: number | null;
  companyAccommodation: string;
};

function parseWagePackage(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Reconstruct hire-time role and package by walking alterations backward. */
export function resolveStartingEmployment({
  items,
  positions,
  departments,
  currentPositionId,
  currentDepartmentId,
  currentWagePackage,
  currentCompanyAccommodation,
}: {
  items: StaffPositionSalaryChangeItem[];
  positions: Position[];
  departments: Department[];
  currentPositionId: string;
  currentDepartmentId: string;
  currentWagePackage: string;
  currentCompanyAccommodation: string;
}): StartingEmployment {
  let positionId = currentPositionId;
  let departmentId = currentDepartmentId;
  let positionName = positions.find((p) => p.id === positionId)?.name ?? "";
  let departmentName =
    departments.find((d) => d.id === departmentId)?.name ?? "";
  let wagePackage = parseWagePackage(currentWagePackage);
  let companyAccommodation = currentCompanyAccommodation || "No";

  const newestFirst = [...items].sort((a, b) => {
    const byDate = b.effectiveDate.localeCompare(a.effectiveDate);
    if (byDate !== 0) return byDate;
    return b.createdAt.localeCompare(a.createdAt);
  });

  for (const item of newestFirst) {
    const positionChanged =
      item.changeKind === "position" || item.changeKind === "both";
    const salaryChanged =
      item.changeKind === "salary" || item.changeKind === "both";

    if (positionChanged) {
      positionId = item.fromPositionId ?? "";
      departmentId = item.fromDepartmentId ?? "";
      positionName =
        item.fromPositionName ||
        positions.find((p) => p.id === positionId)?.name ||
        "";
      departmentName =
        item.fromDepartmentName ||
        departments.find((d) => d.id === departmentId)?.name ||
        "";
    }
    if (salaryChanged) {
      wagePackage = item.fromWagePackage;
      companyAccommodation = item.fromCompanyAccommodation || "No";
    }
  }

  if (!positionName && positionId) {
    positionName = positions.find((p) => p.id === positionId)?.name ?? "";
  }
  if (!departmentName && departmentId) {
    departmentName = departments.find((d) => d.id === departmentId)?.name ?? "";
  }

  return {
    positionName,
    departmentName,
    wagePackage,
    companyAccommodation,
  };
}

export function EmploymentStartedMarker({
  joiningDate,
  start,
  canViewSalary,
  salaryPct,
}: {
  joiningDate: string;
  start: StartingEmployment;
  canViewSalary: boolean;
  salaryPct: SalaryPercentages;
}) {
  const accom = accommodationPhrase(start.companyAccommodation);
  const roleLabel = [start.positionName, start.departmentName]
    .filter(Boolean)
    .join(" · ");
  const pay =
    canViewSalary && start.wagePackage != null
      ? computeSalaryBreakdown(
          start.wagePackage,
          start.companyAccommodation === "Yes",
          salaryPct,
        )
      : null;

  return (
    <li className="relative pl-6">
      <span
        className="absolute left-0 top-3 size-2.5 rounded-full border-2 border-white bg-black/25 shadow-sm ring-1 ring-black/10"
        aria-hidden
      />
      <div className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-3 sm:px-4">
        <p className="text-sm font-medium tabular-nums text-[#3D421F]">
          {formatDateOnly(joiningDate)}
        </p>
        <p className="mt-1 text-sm text-black/50">Employment started</p>
        {roleLabel ? (
          <p className="mt-1 text-sm text-[#3D421F]">{roleLabel}</p>
        ) : null}
        {canViewSalary && start.wagePackage != null ? (
          <p className="mt-1 text-xs text-black/50">
            Package{" "}
            <span className="font-semibold tabular-nums text-[#3D421F]">
              {formatAed(start.wagePackage)}
            </span>
            {accom ? (
              <>
                {" · "}
                <span className="font-semibold text-[#3D421F]">{accom}</span>
              </>
            ) : null}
            {pay?.salaryToPay != null ? (
              <>
                {" · "}
                Salary to pay{" "}
                <span className="font-semibold tabular-nums text-[#3D421F]">
                  {formatAed(pay.salaryToPay)}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}

type StaffEmploymentPathPositionSalaryProps = {
  staffId?: string | null;
  joiningDate?: string | null;
  canViewSalary?: boolean;
  canEdit?: boolean;
  departments: Department[];
  positions: Position[];
  currentDepartmentId: string;
  currentPositionId: string;
  currentWagePackage: string;
  currentCompanyAccommodation: string;
  currentVisaStatus?: string;
  currentVisaExpiry?: string;
  salaryPct: SalaryPercentages;
  items?: StaffPositionSalaryChangeItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onItemsChange?: (items: StaffPositionSalaryChangeItem[]) => void;
  onApplied?: (patch: {
    department_id: string;
    position_id: string;
    wage_package: string;
    company_accommodation: string;
    visa_status?: string;
    visa_expiry?: string;
  }) => void;
  /** Open edit dialog for this change id once items are loaded. */
  openEditChangeId?: string | null;
  onOpenEditChangeIdConsumed?: () => void;
};

function kindLabel(
  kind: StaffPositionSalaryChangeItem["changeKind"],
  changeVisa: boolean,
) {
  const base =
    kind === "position"
      ? "Position"
      : kind === "salary"
        ? "Salary"
        : kind === "both"
          ? "Position & salary"
          : "Visa";
  if (kind === "visa") return base;
  if (changeVisa) return `${base} · Visa`;
  return base;
}

function kindBadgeClass(kind: StaffPositionSalaryChangeItem["changeKind"]) {
  switch (kind) {
    case "position":
      return "border-sky-200/80 bg-sky-50 text-sky-950";
    case "salary":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-950";
    case "both":
      return "border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/10 text-[#3D421F]";
    case "visa":
      return "border-amber-200/80 bg-amber-50 text-amber-950";
  }
}

function ChangePathRow({
  item,
  canViewSalary,
  canEdit,
  salaryPct,
  onEdit,
}: {
  item: StaffPositionSalaryChangeItem;
  canViewSalary: boolean;
  canEdit: boolean;
  salaryPct: SalaryPercentages;
  onEdit?: (item: StaffPositionSalaryChangeItem) => void;
}) {
  const showPosition =
    item.changeKind === "position" || item.changeKind === "both";
  const showSalary =
    item.changeKind === "salary" || item.changeKind === "both";

  const fromPay = showSalary
    ? computeSalaryBreakdown(
        item.fromWagePackage,
        item.fromCompanyAccommodation === "Yes",
        salaryPct,
      )
    : null;
  const toPay = showSalary
    ? computeSalaryBreakdown(
        item.toWagePackage,
        item.toCompanyAccommodation === "Yes",
        salaryPct,
      )
    : null;

  const fromAccom = accommodationPhrase(item.fromCompanyAccommodation);
  const toAccom = accommodationPhrase(item.toCompanyAccommodation);

  return (
    <li className="relative pl-6">
      <span
        className="absolute left-0 top-3 size-2.5 rounded-full border-2 border-white bg-[var(--venue-primary,#6B7B3A)] shadow-sm ring-1 ring-black/10"
        aria-hidden
      />
      <div className="rounded-lg border border-black/8 bg-white/70 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium tabular-nums text-[#3D421F]">
              {formatDateOnly(item.effectiveDate)}
            </span>
            <span
              className={cn(
                "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                kindBadgeClass(item.changeKind),
              )}
            >
              {kindLabel(item.changeKind, item.changeVisa)}
            </span>
          </div>
          {canEdit && onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#3D421F] transition hover:bg-[var(--venue-primary)]/10"
            >
              <Pencil className="h-3 w-3" aria-hidden />
              Edit
            </button>
          ) : null}
        </div>

        {showPosition ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[#3D421F]">
            <span className="text-black/45">
              {item.fromPositionName || "—"}
              {item.fromDepartmentName
                ? ` · ${item.fromDepartmentName}`
                : ""}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-black/30" />
            <span className="font-medium">
              {item.toPositionName || "—"}
              {item.toDepartmentName ? ` · ${item.toDepartmentName}` : ""}
            </span>
          </p>
        ) : null}

        {showSalary && canViewSalary ? (
          <div className="mt-1.5 space-y-1 text-sm text-[#3D421F]">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-black/40">
                Package
              </span>
              <span className="font-semibold tabular-nums text-black/55">
                {formatAed(item.fromWagePackage)}
                {fromAccom ? ` · ${fromAccom}` : ""}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-black/30" />
              <span className="font-bold tabular-nums text-[#3D421F]">
                {formatAed(item.toWagePackage)}
                {toAccom ? ` · ${toAccom}` : ""}
              </span>
            </p>
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-black/40">
                Salary to pay
              </span>
              <span className="font-semibold tabular-nums text-black/55">
                {formatAed(fromPay?.salaryToPay)}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-black/30" />
              <span className="font-bold tabular-nums text-[#3D421F]">
                {formatAed(toPay?.salaryToPay)}
              </span>
            </p>
          </div>
        ) : null}

        {showSalary && !canViewSalary ? (
          <p className="mt-1.5 text-sm text-black/45">Salary updated</p>
        ) : null}

        {item.changeVisa ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-[#3D421F]">
            <span className="text-[11px] font-medium uppercase tracking-wide text-black/40">
              Visa
            </span>
            <span className="text-black/55">
              {item.fromVisaStatus || "—"}
              {item.fromVisaExpiry
                ? ` · ${formatDateOnly(item.fromVisaExpiry)}`
                : ""}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-black/30" />
            <span className="font-medium">
              {item.toVisaStatus || "—"}
              {item.toVisaExpiry
                ? ` · ${formatDateOnly(item.toVisaExpiry)}`
                : ""}
            </span>
          </p>
        ) : null}

        {item.reason.trim() ? (
          <p className="mt-2 text-xs text-black/50">
            <span className="font-medium text-black/55">Reason:</span>{" "}
            {item.reason}
          </p>
        ) : null}
        {item.notes?.trim() ? (
          <p className="mt-1 text-xs text-black/40">{item.notes}</p>
        ) : null}
      </div>
    </li>
  );
}

function AlterationDialog({
  open,
  onClose,
  staffId,
  canViewSalary,
  departments,
  positions,
  currentDepartmentId,
  currentPositionId,
  currentWagePackage,
  currentCompanyAccommodation,
  currentVisaStatus,
  currentVisaExpiry,
  salaryPct,
  editingItem = null,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  staffId: string;
  canViewSalary: boolean;
  departments: Department[];
  positions: Position[];
  currentDepartmentId: string;
  currentPositionId: string;
  currentWagePackage: string;
  currentCompanyAccommodation: string;
  currentVisaStatus: string;
  currentVisaExpiry: string;
  salaryPct: SalaryPercentages;
  editingItem?: StaffPositionSalaryChangeItem | null;
  onSaved: (result: {
    item: StaffPositionSalaryChangeItem;
    staffPatch: {
      department_id: string;
      position_id: string;
      wage_package: string;
      company_accommodation: string;
      visa_status?: string;
      visa_expiry?: string;
    };
  }) => void;
}) {
  const isEdit = Boolean(editingItem);
  const [changePosition, setChangePosition] = useState(false);
  const [changeSalary, setChangeSalary] = useState(false);
  const [changeVisa, setChangeVisa] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [departmentId, setDepartmentId] = useState(currentDepartmentId);
  const [positionId, setPositionId] = useState(currentPositionId);
  const [wagePackage, setWagePackage] = useState(currentWagePackage);
  const [companyAccommodation, setCompanyAccommodation] = useState(
    currentCompanyAccommodation || "No",
  );
  const [visaStatus, setVisaStatus] = useState(currentVisaStatus);
  const [visaExpiry, setVisaExpiry] = useState(currentVisaExpiry);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const baselineDeptId =
    editingItem?.fromDepartmentId ?? currentDepartmentId;
  const baselinePosId = editingItem?.fromPositionId ?? currentPositionId;
  const baselineWage =
    editingItem?.fromWagePackage != null
      ? String(editingItem.fromWagePackage)
      : currentWagePackage;
  const baselineAccom =
    editingItem?.fromCompanyAccommodation ||
    currentCompanyAccommodation ||
    "No";
  const baselineVisaStatus =
    editingItem?.fromVisaStatus ?? currentVisaStatus;
  const baselineVisaExpiry =
    editingItem?.fromVisaExpiry ?? currentVisaExpiry;

  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setChangePosition(
        editingItem.changeKind === "position" ||
          editingItem.changeKind === "both",
      );
      setChangeSalary(
        editingItem.changeKind === "salary" ||
          editingItem.changeKind === "both",
      );
      setChangeVisa(editingItem.changeVisa || editingItem.changeKind === "visa");
      setEffectiveDate(editingItem.effectiveDate);
      setDepartmentId(editingItem.toDepartmentId ?? "");
      setPositionId(editingItem.toPositionId ?? "");
      setWagePackage(
        editingItem.toWagePackage != null
          ? String(editingItem.toWagePackage)
          : "",
      );
      setCompanyAccommodation(editingItem.toCompanyAccommodation || "No");
      setVisaStatus(editingItem.toVisaStatus ?? currentVisaStatus);
      setVisaExpiry(editingItem.toVisaExpiry ?? currentVisaExpiry);
      setReason(editingItem.reason);
      setNotes(editingItem.notes ?? "");
      return;
    }
    setChangePosition(false);
    setChangeSalary(canViewSalary);
    setChangeVisa(false);
    setEffectiveDate("");
    setDepartmentId(currentDepartmentId);
    setPositionId(currentPositionId);
    setWagePackage(currentWagePackage);
    setCompanyAccommodation(currentCompanyAccommodation || "No");
    setVisaStatus(currentVisaStatus);
    setVisaExpiry(currentVisaExpiry);
    setReason("");
    setNotes("");
  }, [
    open,
    editingItem,
    canViewSalary,
    currentDepartmentId,
    currentPositionId,
    currentWagePackage,
    currentCompanyAccommodation,
    currentVisaStatus,
    currentVisaExpiry,
  ]);

  const positionsForDept = useMemo(
    () =>
      positions.filter(
        (p) => !departmentId || p.department_id === departmentId,
      ),
    [positions, departmentId],
  );

  const wageNum =
    wagePackage.trim() === "" ? null : Number(wagePackage);
  const breakdown = computeSalaryBreakdown(
    wageNum,
    companyAccommodation.toLowerCase() === "yes",
    salaryPct,
  );

  const salaryChangeActive = changeSalary && canViewSalary;
  /** Salary updates must start on the 1st — payroll uses one package per month. */
  const requireMonthStart = salaryChangeActive;

  const canSubmit =
    Boolean(effectiveDate.trim()) &&
    (changePosition || salaryChangeActive || changeVisa) &&
    (!requireMonthStart || /^\d{4}-\d{2}-01$/.test(effectiveDate));

  if (!open || typeof document === "undefined") return null;

  function submit() {
    if (!effectiveDate.trim()) {
      toast.error("Effective date is required.");
      return;
    }
    if (requireMonthStart && !/^\d{4}-\d{2}-01$/.test(effectiveDate)) {
      toast.error(
        "Salary changes must take effect on the 1st of a month.",
      );
      return;
    }
    if (!changePosition && !salaryChangeActive && !changeVisa) {
      toast.error("Choose a position, salary, and/or visa change.");
      return;
    }
    startTransition(async () => {
      const payload = {
        staffId,
        effectiveDate: requireMonthStart
          ? toMonthStartIso(effectiveDate)
          : effectiveDate,
        changePosition,
        changeSalary: salaryChangeActive,
        changeVisa,
        toDepartmentId: departmentId || null,
        toPositionId: positionId || null,
        toWagePackage: wageNum,
        toCompanyAccommodation: companyAccommodation,
        toVisaStatus: visaStatus || null,
        toVisaExpiry: visaExpiry || null,
        reason,
        notes,
      };
      const result = editingItem
        ? await updateStaffPositionSalaryChange({
            ...payload,
            changeId: editingItem.id,
          })
        : await createStaffPositionSalaryChange(payload);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(
        isEdit
          ? "Alteration updated."
          : "Alteration saved — employment details updated.",
      );
      onSaved({ item: result.item, staffPatch: result.staffPatch });
      onClose();
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-salary-alteration-title"
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-5 py-4">
          <div>
            <h3
              id="position-salary-alteration-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              {isEdit ? "Edit alteration" : "New alteration"}
            </h3>
            <p className="mt-0.5 text-sm text-black/50">
              {isEdit
                ? "Update this path record. If it is still the latest change, Employment details refresh to match."
                : "Set the effective date, then the change. Saving updates this employee’s Employment details automatically."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {requireMonthStart ? (
            <div className="space-y-1">
              <PayrollMonthPicker
                id="alteration-effective-month"
                label="Effective month *"
                value={monthInputValue(effectiveDate)}
                onChange={(monthKey) =>
                  setEffectiveDate(monthKey ? `${monthKey}-01` : "")
                }
                className="w-full"
              />
              <p className="text-xs leading-relaxed text-black/45">
                <span className="font-medium text-[#3D421F]">
                  Must be the 1st of a month.
                </span>{" "}
                Payroll uses one salary package for the whole month — mid-month
                changes are not prorated yet. Pick the month the new package
                should start; the Employment tab updates to that package when
                you save.
              </p>
            </div>
          ) : (
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-medium text-black/55">
                Effective date <span className="text-red-600">*</span>
              </span>
              <DateInput
                value={effectiveDate}
                onChange={setEffectiveDate}
                className="w-full"
                inputClassName={fieldClass}
              />
              <span className="block text-xs text-black/40">
                Required. Position-only moves can use any day. Add a salary
                update and the date will be limited to the 1st of a month.
              </span>
            </label>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2 text-[#3D421F]">
              <input
                type="checkbox"
                checked={changePosition}
                onChange={(e) => setChangePosition(e.target.checked)}
                className="size-4 rounded border-black/20"
              />
              Position change
            </label>
            {canViewSalary ? (
              <label className="inline-flex items-center gap-2 text-[#3D421F]">
                <input
                  type="checkbox"
                  checked={changeSalary}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setChangeSalary(next);
                    if (next && effectiveDate) {
                      setEffectiveDate(toMonthStartIso(effectiveDate));
                    }
                  }}
                  className="size-4 rounded border-black/20"
                />
                Salary update
              </label>
            ) : null}
            <label className="inline-flex items-center gap-2 text-[#3D421F]">
              <input
                type="checkbox"
                checked={changeVisa}
                onChange={(e) => setChangeVisa(e.target.checked)}
                className="size-4 rounded border-black/20"
              />
              Visa update
            </label>
          </div>
          <p className="text-xs text-black/40">
            Salary-only increments keep the current role. Position-only moves
            keep the current package. Visa can be updated on its own or with
            either change.
          </p>

          {changePosition ? (
            <div className="space-y-3 rounded-lg border border-black/8 bg-black/[0.02] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                New position
              </p>
              <p className="text-xs text-black/45">
                Current:{" "}
                <span className="text-[#3D421F]">
                  {positions.find((p) => p.id === baselinePosId)?.name || "—"}
                  {baselineDeptId
                    ? ` · ${
                        departments.find((d) => d.id === baselineDeptId)
                          ?.name ?? ""
                      }`
                    : ""}
                </span>
              </p>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium text-black/55">
                  Department
                </span>
                <select
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    setPositionId("");
                  }}
                  className={fieldClass}
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium text-black/55">
                  Position
                </span>
                <select
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">—</option>
                  {positionsForDept.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {changeSalary && canViewSalary ? (
            <div className="space-y-3 rounded-lg border border-black/8 bg-black/[0.02] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                New salary
              </p>
              <p className="text-xs text-black/45">
                Current:{" "}
                <span className="tabular-nums text-[#3D421F]">
                  {formatAed(
                    baselineWage.trim() === "" ? null : Number(baselineWage),
                  )}
                  {baselineAccom === "Yes"
                    ? ` · ${accommodationPhrase("Yes")}`
                    : ""}
                </span>
              </p>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium text-black/55">
                  Company accommodation
                </span>
                <select
                  value={companyAccommodation}
                  onChange={(e) => setCompanyAccommodation(e.target.value)}
                  className={fieldClass}
                >
                  <option value="No">No</option>
                  <option value="Yes">
                    Yes — with Company Accommodation Provided
                  </option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium text-black/55">
                  Wage package (AED)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={wagePackage}
                  onChange={(e) => setWagePackage(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <dl className="grid grid-cols-3 gap-2 text-xs text-black/50">
                <div>
                  <dt>Basic {salaryPct.basic}%</dt>
                  <dd className="tabular-nums text-[#3D421F]">
                    {formatAed(breakdown.basic)}
                  </dd>
                </div>
                <div>
                  <dt>Accom {salaryPct.accom}%</dt>
                  <dd className="tabular-nums text-[#3D421F]">
                    {formatAed(breakdown.accom)}
                  </dd>
                </div>
                <div>
                  <dt>Transport {salaryPct.transp}%</dt>
                  <dd className="tabular-nums text-[#3D421F]">
                    {formatAed(breakdown.transp)}
                  </dd>
                </div>
              </dl>
              <div className="rounded-md border border-black/8 bg-white/80 px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-black/55">
                    Salary to pay
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[#3D421F]">
                    {formatAed(breakdown.salaryToPay)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-black/40">
                  {companyAccommodation.toLowerCase() === "yes"
                    ? "In accommodation — basic portion only."
                    : "Not in accommodation — full package."}
                </p>
              </div>
            </div>
          ) : null}

          {changeVisa ? (
            <div className="space-y-3 rounded-lg border border-black/8 bg-black/[0.02] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                New visa
              </p>
              <p className="text-xs text-black/45">
                Current:{" "}
                <span className="text-[#3D421F]">
                  {baselineVisaStatus || "—"}
                  {baselineVisaExpiry
                    ? ` · ${formatDateOnly(baselineVisaExpiry)}`
                    : ""}
                </span>
              </p>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium text-black/55">
                  Visa status
                </span>
                <select
                  value={visaStatus}
                  onChange={(e) => setVisaStatus(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">—</option>
                  {VISA_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium text-black/55">
                  Visa expiry
                </span>
                <DateInput
                  value={visaExpiry}
                  onChange={setVisaExpiry}
                  className="w-full"
                  inputClassName={fieldClass}
                />
              </label>
            </div>
          ) : null}

          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-black/55">
              Reason (optional)
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Promotion, market adjustment…"
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-black/55">
              Notes (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-black/8 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/5 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !canSubmit}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--venue-primary)] px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            {isEdit ? "Save changes" : "Save alteration"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function StaffEmploymentPathPositionSalary({
  staffId = null,
  joiningDate = null,
  canViewSalary = false,
  canEdit = false,
  departments,
  positions,
  currentDepartmentId,
  currentPositionId,
  currentWagePackage,
  currentCompanyAccommodation,
  currentVisaStatus = "",
  currentVisaExpiry = "",
  salaryPct,
  items: itemsProp,
  loading: loadingProp,
  error: errorProp,
  onRetry,
  onItemsChange,
  onApplied,
  openEditChangeId = null,
  onOpenEditChangeIdConsumed,
}: StaffEmploymentPathPositionSalaryProps) {
  const isControlled = itemsProp !== undefined;
  const [localItems, setLocalItems] = useState<StaffPositionSalaryChangeItem[]>(
    [],
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(
    () => Boolean(staffId) && !isControlled,
  );
  const items = isControlled ? itemsProp : localItems;
  const error = isControlled ? (errorProp ?? null) : localError;
  const loading = isControlled ? Boolean(loadingProp) : localLoading;
  const startingEmployment = useMemo(
    () =>
      resolveStartingEmployment({
        items,
        positions,
        departments,
        currentPositionId,
        currentDepartmentId,
        currentWagePackage,
        currentCompanyAccommodation,
      }),
    [
      items,
      positions,
      departments,
      currentPositionId,
      currentDepartmentId,
      currentWagePackage,
      currentCompanyAccommodation,
    ],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] =
    useState<StaffPositionSalaryChangeItem | null>(null);

  function setItems(next: StaffPositionSalaryChangeItem[]) {
    if (isControlled) onItemsChange?.(next);
    else setLocalItems(next);
  }

  function openCreateDialog() {
    setEditingItem(null);
    setDialogOpen(true);
  }

  function openEditDialog(item: StaffPositionSalaryChangeItem) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingItem(null);
  }

  useEffect(() => {
    if (isControlled) return;
    if (!staffId) {
      setLocalItems([]);
      setLocalError(null);
      setLocalLoading(false);
      return;
    }
    let cancelled = false;
    setLocalLoading(true);
    setLocalError(null);
    void listStaffPositionSalaryChanges(staffId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLocalItems([]);
          setLocalError(result.error);
          return;
        }
        setLocalError(null);
        setLocalItems(result.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLocalItems([]);
        setLocalError(
          err instanceof Error ? err.message : "Could not load history.",
        );
      })
      .finally(() => {
        if (!cancelled) setLocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId, isControlled]);

  useEffect(() => {
    if (!openEditChangeId || items.length === 0) return;
    const match = items.find((row) => row.id === openEditChangeId);
    if (match) openEditDialog(match);
    onOpenEditChangeIdConsumed?.();
  }, [openEditChangeId, items, onOpenEditChangeIdConsumed]);

  if (!staffId) {
    return (
      <Card className="space-y-2 p-5">
        <h3 className="font-serif text-lg text-[#3D421F]">
          Position &amp; salary
        </h3>
        <p className="text-sm text-black/50">
          Save this employee first to record position or salary alterations.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-serif text-lg text-[#3D421F]">
              Position &amp; salary
            </h3>
            <p className="text-sm leading-relaxed text-black/50">
              Role moves and salary updates — newest first. Each alteration
              needs an effective date and updates Employment automatically.
            </p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 px-3 text-sm font-medium text-[#3D421F] transition hover:bg-[var(--venue-primary)]/20"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New alteration
            </button>
          ) : null}
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-black/50">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading history…
          </div>
        ) : null}

        {error ? (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <p>{error}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs font-medium underline underline-offset-2"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="space-y-3">
            {joiningDate ? (
              <ul className="relative ml-1.5 space-y-3 border-l border-black/10">
                <EmploymentStartedMarker
                  joiningDate={joiningDate}
                  start={startingEmployment}
                  canViewSalary={canViewSalary}
                  salaryPct={salaryPct}
                />
              </ul>
            ) : null}
            <p className="text-sm text-black/45">
              No position, salary, or visa alterations recorded yet.
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="relative ml-1.5 space-y-3 border-l border-black/10">
            {[...items]
              .sort((a, b) => {
                const byDate = b.effectiveDate.localeCompare(a.effectiveDate);
                if (byDate !== 0) return byDate;
                return b.createdAt.localeCompare(a.createdAt);
              })
              .map((item) => (
                <ChangePathRow
                  key={item.id}
                  item={item}
                  canViewSalary={canViewSalary}
                  canEdit={canEdit}
                  salaryPct={salaryPct}
                  onEdit={openEditDialog}
                />
              ))}
            {joiningDate ? (
              <EmploymentStartedMarker
                joiningDate={joiningDate}
                start={startingEmployment}
                canViewSalary={canViewSalary}
                salaryPct={salaryPct}
              />
            ) : null}
          </ul>
        ) : null}
      </Card>

      {canEdit ? (
        <AlterationDialog
          open={dialogOpen}
          onClose={closeDialog}
          staffId={staffId}
          canViewSalary={canViewSalary}
          departments={departments}
          positions={positions}
          currentDepartmentId={currentDepartmentId}
          currentPositionId={currentPositionId}
          currentWagePackage={currentWagePackage}
          currentCompanyAccommodation={currentCompanyAccommodation}
          currentVisaStatus={currentVisaStatus}
          currentVisaExpiry={currentVisaExpiry}
          salaryPct={salaryPct}
          editingItem={editingItem}
          onSaved={({ item, staffPatch }) => {
            const without = items.filter((row) => row.id !== item.id);
            setItems(
              [item, ...without].sort((a, b) => {
                const byDate = b.effectiveDate.localeCompare(a.effectiveDate);
                if (byDate !== 0) return byDate;
                return b.createdAt.localeCompare(a.createdAt);
              }),
            );
            onApplied?.(staffPatch);
          }}
        />
      ) : null}
    </>
  );
}
