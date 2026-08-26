"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MinusCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { PayrollMonthPicker } from "@/components/hr/payroll-month-picker";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BENEFIT_DEDUCTION_KIND_LABELS,
  BENEFIT_DEDUCTION_LATER_SPLIT_LABELS,
  BENEFIT_DEDUCTION_STATUS_LABELS,
  currentMonthKey,
  defaultBenefitDeductionMonthKey,
  formatBenefitDeductionTarget,
  formatBenefitMonthLabel,
  listMatchingRunPeople,
  employeeDeductionBalancesByMonth,
  scheduleBenefitDeduction,
  shiftMonthKey,
  splitEvenly,
  type BenefitDeductionDepartmentOption,
  type BenefitDeductionEntry,
  type BenefitDeductionKind,
  type BenefitDeductionLaterSplitMode,
  type BenefitDeductionStaffOption,
  type BenefitDeductionStaffRef,
  type BenefitDeductionTarget,
  type BenefitPayoutMap,
  type BenefitRunRosterMap,
} from "@/lib/hr/benefits";
import {
  cancelBenefitDeduction,
  createBenefitDeduction,
  deleteBenefitDeduction,
  restoreBenefitDeduction,
  updateBenefitDeduction,
} from "@/lib/actions/hr-benefits";
import {
  EMPLOYMENT_STATUS_NAMES,
  normalizeEmploymentStatusName,
} from "@/lib/hr/employment-status";
import { cn } from "@/lib/utils";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function isDeductionEligibleStaff(staff: BenefitDeductionStaffOption): boolean {
  const status = normalizeEmploymentStatusName(staff.employmentStatusName);
  return (
    status === EMPLOYMENT_STATUS_NAMES.onBoard ||
    status === EMPLOYMENT_STATUS_NAMES.offBoard
  );
}

function toStaffRef(staff: BenefitDeductionStaffOption): BenefitDeductionStaffRef {
  return {
    id: staff.id,
    empNo: staff.empNo || null,
    fullName: staff.fullName,
  };
}

const fieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/55";

function statusClass(status: string): string {
  switch (status) {
    case "cleared":
      return "bg-emerald-100 text-emerald-800";
    case "upcoming":
      return "bg-sky-100 text-sky-800";
    case "cancelled":
      return "bg-black/10 text-black/55";
    default:
      return "bg-amber-100 text-amber-900";
  }
}

export function BenefitDeductionsPanel({
  canEdit,
  staff,
  departments,
  payouts,
  rosters,
  entries,
}: {
  venueId?: string;
  canEdit: boolean;
  staff: BenefitDeductionStaffOption[];
  departments: BenefitDeductionDepartmentOption[];
  payouts: BenefitPayoutMap;
  rosters: BenefitRunRosterMap;
  entries: BenefitDeductionEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [totalRaw, setTotalRaw] = useState("");
  const [benefitKind, setBenefitKind] =
    useState<BenefitDeductionKind>("gratuity");
  const [targetType, setTargetType] = useState<"department" | "people">(
    "department",
  );
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [staffQuery, setStaffQuery] = useState("");
  const [monthCount, setMonthCount] = useState("1");
  const [laterSplitMode, setLaterSplitMode] =
    useState<BenefitDeductionLaterSplitMode>("each_run");
  const [startMonth, setStartMonth] = useState(defaultBenefitDeductionMonthKey);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const departmentMembers = useMemo(() => {
    return staff.filter(
      (row) =>
        row.departmentId === departmentId && isDeductionEligibleStaff(row),
    );
  }, [staff, departmentId]);

  const selectedPeople = useMemo(
    () => staff.filter((row) => selectedIds.has(row.id)),
    [staff, selectedIds],
  );

  const targetStaff: BenefitDeductionStaffOption[] =
    targetType === "department" ? departmentMembers : selectedPeople;

  const staffDirectory = useMemo(
    () =>
      staff.map((row) => ({
        id: row.id,
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        empNo: row.empNo,
        fullName: row.fullName,
      })),
    [staff],
  );

  const totalAmount = Number(totalRaw);
  const months = Math.max(1, Math.min(60, Math.round(Number(monthCount) || 1)));
  const monthlyParts = splitEvenly(
    Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0,
    months,
  );
  const monthlyInstallment = monthlyParts[0] ?? 0;

  const draftTarget: BenefitDeductionTarget | null =
    targetStaff.length === 0
      ? null
      : targetType === "department"
        ? {
            type: "department",
            departmentId,
            departmentName:
              departments.find((d) => d.id === departmentId)?.name ?? "Department",
            staff: targetStaff.map(toStaffRef),
          }
        : { type: "people", staff: targetStaff.map(toStaffRef) };

  const draftSchedule = useMemo(() => {
    if (!draftTarget || !(totalAmount > 0) || !startMonth) return null;
    return scheduleBenefitDeduction(
      {
        id: "draft",
        name: name.trim() || "Draft",
        totalAmount,
        benefitKind,
        target: draftTarget,
        monthCount: months,
        startMonth,
        laterSplitMode,
        createdAt: new Date().toISOString(),
        cancelledAt: null,
      },
      payouts,
      rosters,
      staffDirectory,
    );
  }, [
    benefitKind,
    draftTarget,
    laterSplitMode,
    months,
    name,
    payouts,
    rosters,
    staffDirectory,
    startMonth,
    totalAmount,
  ]);

  const startMonthMatch = useMemo(() => {
    if (!draftTarget || !startMonth) {
      return { runExists: false, people: [] };
    }
    return listMatchingRunPeople(
      rosters,
      benefitKind,
      startMonth,
      draftTarget,
      staffDirectory,
    );
  }, [benefitKind, draftTarget, rosters, staffDirectory, startMonth]);

  const runPeopleCount = startMonthMatch.people.length;
  const perPersonOnRun = splitEvenly(monthlyInstallment, runPeopleCount)[0] ?? 0;
  const splitByMonth = useMemo(() => {
    if (!draftTarget || !(totalAmount > 0) || !startMonth) return [];
    return employeeDeductionBalancesByMonth({
      startMonth,
      monthCount: months,
      totalAmount,
      kind: benefitKind,
      target: draftTarget,
      rosters,
      directory: staffDirectory,
      laterSplitMode,
      schedule: draftSchedule,
    });
  }, [
    benefitKind,
    draftSchedule,
    draftTarget,
    laterSplitMode,
    months,
    rosters,
    staffDirectory,
    startMonth,
    totalAmount,
  ]);
  const affectedIds = useMemo(
    () => new Set(startMonthMatch.people.map((row) => row.staffId)),
    [startMonthMatch.people],
  );
  const departmentChips = useMemo(() => {
    const rosterIds = new Set(departmentMembers.map((row) => row.id));
    const extras = startMonthMatch.people.filter(
      (row) => !rosterIds.has(row.staffId),
    );
    const sortedMembers = [...departmentMembers].sort((a, b) => {
      const aOn = affectedIds.has(a.id) ? 0 : 1;
      const bOn = affectedIds.has(b.id) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.fullName.localeCompare(b.fullName);
    });
    return { sortedMembers, extras };
  }, [affectedIds, departmentMembers, startMonthMatch.people]);

  const scheduledEntries = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        schedule: scheduleBenefitDeduction(
          entry,
          payouts,
          rosters,
          staffDirectory,
        ),
      })),
    [entries, payouts, rosters, staffDirectory],
  );

  const filteredStaffOptions = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    return staff.filter((row) => {
      if (!isDeductionEligibleStaff(row)) return false;
      if (!q) return true;
      const hay = [row.empNo, row.fullName, row.departmentName, row.positionName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [staff, staffQuery]);

  function togglePerson(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setName("");
    setTotalRaw("");
    setSelectedIds(new Set());
    setStaffQuery("");
    setLaterSplitMode("each_run");
    setEditingId(null);
    setError(null);
  }

  function beginEdit(entry: BenefitDeductionEntry) {
    setError(null);
    setSuccess(null);
    setEditingId(entry.id);
    setName(entry.name);
    setTotalRaw(String(entry.totalAmount));
    setBenefitKind(entry.benefitKind);
    setTargetType(entry.target.type);
    if (entry.target.type === "department") {
      setDepartmentId(entry.target.departmentId);
    }
    setSelectedIds(new Set(entry.target.staff.map((row) => row.id)));
    setMonthCount(String(entry.monthCount));
    setLaterSplitMode(entry.laterSplitMode);
    setStartMonth(entry.startMonth);
    setFormOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("new-deduction-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!canEdit) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name the deduction.");
      return;
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setError("Enter a total value greater than zero.");
      return;
    }
    if (!draftTarget) {
      setError(
        targetType === "department"
          ? "Choose a department that has staff to split this deduction."
          : "Select at least one person.",
      );
      return;
    }
    if (!startMonth) {
      setError("Choose the month this deduction starts.");
      return;
    }
    startTransition(async () => {
      const payload = {
        name: trimmed,
        totalAmount,
        benefitKind,
        target: draftTarget,
        monthCount: months,
        startMonth,
        laterSplitMode,
      };
      const result = editingId
        ? await updateBenefitDeduction(editingId, payload)
        : await createBenefitDeduction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        editingId ? `Updated “${trimmed}”.` : `Saved “${trimmed}”.`,
      );
      resetForm();
      setFormOpen(false);
      router.refresh();
    });
  }

  const lastPlannedMonth = shiftMonthKey(startMonth, months - 1);

  return (
    <div className="space-y-6">
      {canEdit ? (
        <div className="rounded-xl border border-black/10 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 p-5">
            <p className="min-w-0 text-sm text-black/55">
              Split each month’s installment equally across the people who are
              on that month’s gratuity or service charge run — a department’s
              staff on the run, or selected people who appear on it. If a
              month cannot cover the amount, the rest rolls forward until it
              is cleared.
              {success && !formOpen ? (
                <span className="mt-2 block text-sm text-emerald-800">
                  {success}
                </span>
              ) : null}
            </p>
            <Button
              type="button"
              aria-expanded={formOpen}
              aria-controls="new-deduction-form"
              onClick={() => setFormOpen((open) => !open)}
              className="h-10 shrink-0"
            >
              {formOpen ? (
                <ChevronDown className="h-4 w-4 rotate-180" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              {editingId ? "Edit deduction" : "New deduction"}
            </Button>
          </div>
          {formOpen ? (
        <form
          id="new-deduction-form"
          className="space-y-4 border-t border-black/10 px-5 pb-5 pt-4"
          onSubmit={onSubmit}
        >

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="deduction-name">Name of the deduction</Label>
              <Input
                id="deduction-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kitchen equipment"
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deduction-total">Total value (AED)</Label>
              <Input
                id="deduction-total"
                inputMode="decimal"
                value={totalRaw}
                onChange={(e) => setTotalRaw(e.target.value)}
                placeholder="1627.50"
                className={fieldClass}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-[#3D421F]">
              Deduct from
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["gratuity", "Gratuity"],
                  ["service_charge", "Service charge"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    benefitKind === value
                      ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15 text-[#3D421F]"
                      : "border-black/10 bg-white text-black/60 hover:bg-black/[0.03]",
                  )}
                >
                  <input
                    type="radio"
                    name="benefit-kind"
                    value={value}
                    checked={benefitKind === value}
                    onChange={() => setBenefitKind(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-[#3D421F]">
              Deduct from whom
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["department", "A department (split on each month’s run)"],
                  ["people", "One or more people (split on each month’s run)"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    targetType === value
                      ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15 text-[#3D421F]"
                      : "border-black/10 bg-white text-black/60 hover:bg-black/[0.03]",
                  )}
                >
                  <input
                    type="radio"
                    name="target-type"
                    value={value}
                    checked={targetType === value}
                    onChange={() => setTargetType(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>

            {targetType === "department" ? (
              <div className="space-y-2">
                <Label htmlFor="deduction-department">Department</Label>
                <select
                  id="deduction-department"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className={fieldClass}
                >
                  {departments.length === 0 ? (
                    <option value="">No departments</option>
                  ) : (
                    departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-sm text-black/55">
                  {departmentMembers.length === 0
                    ? "No on-board staff in this department."
                    : !startMonthMatch.runExists
                      ? `Each month is split across ${
                          departments.find((d) => d.id === departmentId)?.name ??
                          "this department"
                        } staff on that month’s ${
                          BENEFIT_DEDUCTION_KIND_LABELS[benefitKind]
                        } run. No ${formatBenefitMonthLabel(`${startMonth}-01`)} run yet.`
                      : `${runPeopleCount} of ${departmentMembers.length} highlighted ${
                          runPeopleCount === 1 ? "person is" : "people are"
                        } on the ${formatBenefitMonthLabel(`${startMonth}-01`)} ${
                          BENEFIT_DEDUCTION_KIND_LABELS[benefitKind]
                        } run and will share this deduction.`}
                </p>
                {departmentMembers.length > 0 ||
                departmentChips.extras.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {departmentChips.sortedMembers.map((row) => {
                      const affected =
                        startMonthMatch.runExists && affectedIds.has(row.id);
                      return (
                        <li
                          key={row.id}
                          aria-label={
                            !startMonthMatch.runExists
                              ? row.fullName
                              : affected
                                ? `${row.fullName}, on this month’s run`
                                : `${row.fullName}, not on this month’s run`
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
                            affected
                              ? "border-[var(--venue-primary)]/50 bg-[var(--venue-primary)]/25 font-medium text-[#3D421F] ring-1 ring-[var(--venue-primary)]/35"
                              : startMonthMatch.runExists
                                ? "border-black/10 bg-black/[0.03] text-black/40"
                                : "border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-[#3D421F]",
                          )}
                        >
                          {row.fullName}
                        </li>
                      );
                    })}
                    {departmentChips.extras.map((row) => (
                      <li
                        key={row.staffId}
                        aria-label={`${row.fullName}, on this month’s run`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--venue-primary)]/50 bg-[var(--venue-primary)]/25 px-2 py-0.5 text-xs font-medium text-[#3D421F] ring-1 ring-[var(--venue-primary)]/35"
                      >
                        {row.fullName}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="deduction-staff-search">People</Label>
                {selectedPeople.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {selectedPeople.map((row) => {
                      const affected =
                        startMonthMatch.runExists && affectedIds.has(row.id);
                      return (
                        <li
                          key={row.id}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                            affected
                              ? "border-[var(--venue-primary)]/50 bg-[var(--venue-primary)]/25 font-medium text-[#3D421F] ring-1 ring-[var(--venue-primary)]/35"
                              : startMonthMatch.runExists
                                ? "border-black/10 bg-black/[0.03] text-black/45"
                                : "border-black/10 bg-[var(--venue-primary)]/15 text-[#3D421F]",
                          )}
                        >
                          {row.fullName}
                          <button
                            type="button"
                            onClick={() => togglePerson(row.id)}
                            className="rounded-full p-0.5 hover:bg-black/10"
                            aria-label={`Remove ${row.fullName}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-black/45">No one selected yet.</p>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                  <input
                    id="deduction-staff-search"
                    type="search"
                    value={staffQuery}
                    onChange={(e) => setStaffQuery(e.target.value)}
                    placeholder="Search emp no, name, department…"
                    className={`${fieldClass} pl-9`}
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-black/10">
                  {filteredStaffOptions.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-black/45">
                      No matching staff.
                    </p>
                  ) : (
                    <ul className="divide-y divide-black/5">
                      {filteredStaffOptions.map((row) => {
                        const checked = selectedIds.has(row.id);
                        return (
                          <li key={row.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[var(--venue-secondary,#F0F3DD)]/40">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePerson(row.id)}
                                className="rounded border-black/20"
                              />
                              <StaffPhotoThumbnail
                                fullName={row.fullName}
                                photoUrl={row.photoUrl}
                                size="sm"
                                className="h-8 w-8 rounded-md text-[9px]"
                                empNo={row.empNo}
                                department={row.departmentName}
                                position={row.positionName}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium text-[#3D421F]">
                                  {row.fullName}
                                </span>
                                <span className="block text-xs text-black/50">
                                  {row.empNo || "—"}
                                  {row.departmentName
                                    ? ` · ${row.departmentName}`
                                    : ""}
                                  {row.positionName
                                    ? ` · ${row.positionName}`
                                    : ""}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label
                htmlFor="deduction-months"
                className="text-[11px] font-medium uppercase tracking-wide text-black/45"
              >
                How many months
              </label>
              <Input
                id="deduction-months"
                type="number"
                min={1}
                max={60}
                step={1}
                value={monthCount}
                onChange={(e) => setMonthCount(e.target.value)}
                className={`${fieldClass} rounded-lg`}
              />
            </div>
            <PayrollMonthPicker
              id="deduction-start-month"
              label="Start month"
              value={startMonth}
              onChange={setStartMonth}
              className="min-w-0 w-full"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-medium uppercase tracking-wide text-black/45">
              Later months
            </legend>
            <p className="text-sm text-black/55">
              From the second month onward, split among:
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  ["each_run", BENEFIT_DEDUCTION_LATER_SPLIT_LABELS.each_run],
                  ["first_run", BENEFIT_DEDUCTION_LATER_SPLIT_LABELS.first_run],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "inline-flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                    laterSplitMode === value
                      ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15 text-[#3D421F]"
                      : "border-black/10 bg-white text-black/60 hover:bg-black/[0.03]",
                  )}
                >
                  <input
                    type="radio"
                    name="later-split-mode"
                    value={value}
                    checked={laterSplitMode === value}
                    onChange={() => setLaterSplitMode(value)}
                    className="mt-0.5"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-4 py-3 text-sm text-[#3D421F]">
            <p className="font-medium">After the split</p>
            {targetStaff.length === 0 || !(totalAmount > 0) ? (
              <p className="mt-1 text-black/55">
                Enter a total and choose who it applies to to see the split.
              </p>
            ) : !startMonthMatch.runExists ? (
              <p className="mt-1 text-black/55">
                No {BENEFIT_DEDUCTION_KIND_LABELS[benefitKind]} run for{" "}
                {formatBenefitMonthLabel(`${startMonth}-01`)} yet. The
                installment will be split equally across whoever from this{" "}
                {targetType === "department" ? "department" : "selection"} is
                on that month’s run.
              </p>
            ) : runPeopleCount === 0 ? (
              <p className="mt-1 text-black/55">
                Nobody from this{" "}
                {targetType === "department" ? "department" : "selection"} is
                on the {formatBenefitMonthLabel(`${startMonth}-01`)}{" "}
                {BENEFIT_DEDUCTION_KIND_LABELS[benefitKind]} run. The amount
                will roll forward until someone matching is on a run.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-black/70">
                <li>
                  {runPeopleCount}{" "}
                  {runPeopleCount === 1 ? "person" : "people"} on{" "}
                  {formatBenefitMonthLabel(`${startMonth}-01`)}{" "}
                  {BENEFIT_DEDUCTION_KIND_LABELS[benefitKind]} run ·{" "}
                  {formatMoney(perPersonOnRun)} each
                </li>
                <li>
                  Planned {formatMoney(monthlyInstallment)} / month for{" "}
                  {months} month{months === 1 ? "" : "s"} (
                  {formatBenefitMonthLabel(`${startMonth}-01`)}
                  {months > 1
                    ? ` → ${formatBenefitMonthLabel(`${lastPlannedMonth}-01`)}`
                    : ""}
                  )
                  {months > 1
                    ? laterSplitMode === "first_run"
                      ? ". Later months stay with the same people as the first month’s run."
                      : ". Later months re-split among whoever is on that month’s run."
                    : ""}
                </li>
                <li>
                  Remaining to deduct:{" "}
                  <span className="font-semibold tabular-nums text-[#3D421F]">
                    {formatMoney(draftSchedule?.remaining ?? totalAmount)}
                  </span>
                  {draftSchedule && draftSchedule.applied > 0 ? (
                    <span className="text-black/50">
                      {" "}
                      · {formatMoney(draftSchedule.applied)} already applied
                      against calculated runs
                    </span>
                  ) : null}
                </li>
              </ul>
            )}
            {splitByMonth.length > 0 ? (
              <div className="mt-3 max-h-80 space-y-3 overflow-auto">
                {splitByMonth.map((block) => (
                  <div
                    key={block.monthKey}
                    className="overflow-hidden rounded-md border border-black/10 bg-white"
                  >
                    <p className="border-b border-black/5 bg-[var(--venue-secondary,#F0F3DD)] px-2.5 py-1.5 text-xs font-medium text-[#3D421F]">
                      {formatBenefitMonthLabel(`${block.monthKey}-01`)}
                      {block.runExists
                        ? ` · ${block.people.length} ${
                            block.people.length === 1 ? "person" : "people"
                          } · ${formatMoney(block.installment)}`
                        : ` · no run yet · ${formatMoney(block.installment)} planned`}
                    </p>
                    {block.people.length > 0 ? (
                      <table className="min-w-full text-left text-xs">
                        <thead className="text-black/45">
                          <tr>
                            <th className="px-2.5 py-1.5 font-medium">Staff</th>
                            <th className="px-2.5 py-1.5 text-right font-medium">
                              Planned
                            </th>
                            <th className="px-2.5 py-1.5 text-right font-medium">
                              Applied
                            </th>
                            <th className="px-2.5 py-1.5 text-right font-medium">
                              Pending
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {block.people.map((row) => (
                            <tr key={row.staffId}>
                              <td className="px-2.5 py-1.5 text-[#3D421F]">
                                {row.fullName}
                                {row.empNo ? (
                                  <span className="text-black/40">
                                    {" "}
                                    · {row.empNo}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-black/70">
                                {formatMoney(row.planned)}
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-black/70">
                                {formatMoney(row.applied)}
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-[#3D421F]">
                                {formatMoney(row.pending)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-2.5 py-2 text-xs text-black/50">
                        {block.runExists
                          ? "No matching staff on this month’s run."
                          : "This month’s installment rolls forward until a run exists."}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-800">{success}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              className="h-10"
              disabled={!canEdit || pending}
            >
              {pending
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : "Save deduction"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-10"
                disabled={pending}
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="font-serif text-lg text-[#3D421F]">Deductions</h3>
          <p className="text-sm text-black/55">
            Previous and ongoing entries, with remaining value still to be
            taken from later months.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Benefit</th>
                <th className="px-3 py-2.5 font-medium">Applied to</th>
                <th className="px-3 py-2.5 font-medium text-right">Total</th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Per person / month
                </th>
                <th className="px-3 py-2.5 font-medium">Start</th>
                <th className="px-3 py-2.5 font-medium text-right">Applied</th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Remaining
                </th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                {canEdit ? (
                  <th className="px-3 py-2.5 font-medium text-right"> </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {!pending && scheduledEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 10 : 9}
                    className="px-3 py-10 text-center text-sm text-black/45"
                  >
                    <MinusCircle className="mx-auto mb-2 h-6 w-6 text-black/25" />
                    No deductions yet.
                  </td>
                </tr>
              ) : (
                scheduledEntries.map(({ entry, schedule }) => {
                  const expanded = expandedIds.has(entry.id);
                  const colSpan = canEdit ? 10 : 9;
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        className={cn(
                          "hover:bg-[var(--venue-secondary,#F0F3DD)]/25",
                          entry.cancelledAt && "opacity-60",
                        )}
                      >
                        <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => {
                              setExpandedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(entry.id)) next.delete(entry.id);
                                else next.add(entry.id);
                                return next;
                              });
                            }}
                          >
                            {entry.name}
                          </button>
                          <span className="mt-0.5 block text-xs font-normal text-black/45">
                            {schedule.firstMonthRunExists
                              ? `${schedule.firstMonthPeopleCount ?? 0} on start-month run`
                              : "No start-month run yet"}
                          </span>
                        </td>
                    <td className="px-3 py-2.5 text-black/70">
                      {BENEFIT_DEDUCTION_KIND_LABELS[entry.benefitKind]}
                    </td>
                    <td className="px-3 py-2.5 text-black/70">
                      {formatBenefitDeductionTarget(entry.target)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(entry.totalAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-black/70">
                      {schedule.firstMonthRunExists
                        ? formatMoney(schedule.firstMonthPerPerson)
                        : "—"}
                      <span className="block text-xs text-black/45">
                        × {entry.monthCount} mo
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-black/70">
                      {formatBenefitMonthLabel(`${entry.startMonth}-01`)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(schedule.applied)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#3D421F]">
                      {formatMoney(schedule.remaining)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          statusClass(schedule.status),
                        )}
                      >
                        {BENEFIT_DEDUCTION_STATUS_LABELS[schedule.status]}
                      </span>
                    </td>
                    {canEdit ? (
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {entry.cancelledAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8"
                              onClick={() => {
                                startTransition(async () => {
                                  const result = await restoreBenefitDeduction(
                                    entry.id,
                                  );
                                  if (!result.ok) {
                                    setError(result.error);
                                    return;
                                  }
                                  router.refresh();
                                });
                              }}
                              disabled={pending}
                            >
                              Restore
                            </Button>
                          ) : schedule.status !== "cleared" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8"
                              onClick={() => {
                                startTransition(async () => {
                                  const result = await cancelBenefitDeduction(
                                    entry.id,
                                  );
                                  if (!result.ok) {
                                    setError(result.error);
                                    return;
                                  }
                                  router.refresh();
                                });
                              }}
                              disabled={pending}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => beginEdit(entry)}
                            disabled={pending}
                            className="rounded-md p-1.5 text-black/35 hover:bg-[var(--venue-secondary,#F0F3DD)] hover:text-[#3D421F]"
                            aria-label={`Edit ${entry.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              startTransition(async () => {
                                const result = await deleteBenefitDeduction(
                                  entry.id,
                                );
                                if (!result.ok) {
                                  setError(result.error);
                                  return;
                                }
                                if (editingId === entry.id) {
                                  resetForm();
                                  setFormOpen(false);
                                }
                                router.refresh();
                              });
                            }}
                            disabled={pending}
                            className="rounded-md p-1.5 text-black/35 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Delete ${entry.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                      </tr>
                      {expanded ? (
                        <tr className="bg-black/[0.02]">
                          <td colSpan={colSpan} className="px-3 py-3">
                            <div className="space-y-3">
                              {employeeDeductionBalancesByMonth({
                                startMonth: entry.startMonth,
                                monthCount: entry.monthCount,
                                totalAmount: entry.totalAmount,
                                kind: entry.benefitKind,
                                target: entry.target,
                                rosters,
                                directory: staffDirectory,
                                laterSplitMode: entry.laterSplitMode,
                                schedule,
                              }).map((block) => (
                                <div key={block.monthKey}>
                                  <p className="text-[11px] font-medium text-black/50">
                                    {formatBenefitMonthLabel(
                                      `${block.monthKey}-01`,
                                    )}
                                    {block.runExists
                                      ? ` · ${block.people.length} ${
                                          block.people.length === 1
                                            ? "person"
                                            : "people"
                                        }`
                                      : " · no run yet"}
                                  </p>
                                  {block.people.length > 0 ? (
                                    <table className="mt-1 w-full text-left text-xs">
                                      <thead className="text-black/45">
                                        <tr>
                                          <th className="py-1 font-medium">
                                            Staff
                                          </th>
                                          <th className="py-1 text-right font-medium">
                                            Planned
                                          </th>
                                          <th className="py-1 text-right font-medium">
                                            Applied
                                          </th>
                                          <th className="py-1 text-right font-medium">
                                            Pending
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {block.people.map((person) => (
                                          <tr key={person.staffId}>
                                            <td className="py-1 text-[#3D421F]">
                                              {person.fullName}
                                              {person.empNo ? (
                                                <span className="text-black/40">
                                                  {" "}
                                                  · {person.empNo}
                                                </span>
                                              ) : null}
                                            </td>
                                            <td className="py-1 text-right tabular-nums">
                                              {formatMoney(person.planned)}
                                            </td>
                                            <td className="py-1 text-right tabular-nums">
                                              {formatMoney(person.applied)}
                                            </td>
                                            <td className="py-1 text-right tabular-nums font-medium text-[#3D421F]">
                                              {formatMoney(person.pending)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="mt-1 text-xs text-black/45">
                                      No matching staff this month.
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {scheduledEntries.some((row) => row.schedule.staff.length > 1) ? (
          <p className="text-xs text-black/45">
            Remaining is the pool still owed. Each month is split among staff
            on that month’s run. As of{" "}
            {formatBenefitMonthLabel(`${currentMonthKey()}-01`)}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
