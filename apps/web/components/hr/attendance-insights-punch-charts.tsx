"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import {
  Briefcase,
  Calculator,
  ChefHat,
  Clapperboard,
  Fingerprint,
  GlassWater,
  Headphones,
  type LucideProps,
  Megaphone,
  Music2,
  Shield,
  Sparkles,
  UtensilsCrossed,
  Wrench,
  X,
} from "lucide-react";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import {
  mergePayrollSettings,
  payrollMonthContainingDate,
  resolvePayrollPeriod,
} from "@/lib/hr/payroll";
import { cn } from "@/lib/utils";

export type PunchScoreStaffPhoto = {
  empNo: string;
  fullName: string;
  photoUrl: string | null;
  departmentName: string | null;
  positionName: string | null;
  employmentStatusName: string | null;
  workingStatusName: string | null;
  nationalityName: string | null;
  dob: string | null;
  joiningDate: string | null;
  terminationDate: string | null;
};

export type PunchScoreStaffPoint = PunchScoreStaffPhoto & {
  staffId: string;
  departmentName: string;
  dayCount: number;
  completeDayCount: number;
  punchCompletePct: number;
};

export type PunchScoreDepartmentPoint = {
  departmentName: string;
  staffCount: number;
  dayCount: number;
  completeDayCount: number;
  punchCompletePct: number;
};

type PunchBarPoint = {
  key: string;
  label: string;
  secondary?: string;
  pct: number;
  detail: string;
  photos?: PunchScoreStaffPhoto[];
  departmentSymbol?: string;
  onOpen?: () => void;
  /** Deep link to attendance validation for this employee. */
  validationHref?: string;
};

const BEST_COUNT = 8;
const WORST_COUNT = 8;
/** Prefer staff with enough days so one-off perfect/miss days don't dominate. */
const MIN_DAYS_FOR_RANKING = 3;

function formatPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

/** Display first + last name only (drop middle names). */
function firstLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

const BAR_GRADIENTS = {
  mixed:
    "linear-gradient(90deg, #B8893A 0%, #D4A84E 45%, #E8C56A 100%)",
  best: "linear-gradient(90deg, #6B7B3A 0%, var(--venue-primary, #818a40) 50%, #A3B05C 100%)",
  worst: "linear-gradient(90deg, #8F3A3A 0%, #C24B4B 50%, #E07070 100%)",
} as const;

const PCT_TEXT = {
  mixed: "text-[#A67C2D]",
  best: "text-[var(--venue-primary,#818a40)]",
  worst: "text-[#A34A4A]",
} as const;

type DeptIcon = ComponentType<LucideProps>;

/** Keyword → icon for venue department names (first match wins). */
const DEPARTMENT_ICON_RULES: Array<{ match: RegExp; icon: DeptIcon }> = [
  { match: /culin|kitchen|pastry|chef/i, icon: ChefHat },
  { match: /beverage|bar|wine|cocktail/i, icon: GlassWater },
  { match: /f\s*&\s*b|food\s*&\s*bev|service|waiter|host/i, icon: UtensilsCrossed },
  { match: /social|market|pr\b|content|media/i, icon: Megaphone },
  { match: /entertain|show|dj/i, icon: Clapperboard },
  { match: /music|band|live/i, icon: Music2 },
  { match: /financ|account|payroll/i, icon: Calculator },
  { match: /hr|human\s*res|people/i, icon: Headphones },
  { match: /secur|guard/i, icon: Shield },
  { match: /maint|engin|facilit|housekeep|clean/i, icon: Wrench },
  { match: /spa|beauty|wellness/i, icon: Sparkles },
];

function iconForDepartment(name: string): DeptIcon {
  for (const rule of DEPARTMENT_ICON_RULES) {
    if (rule.match.test(name)) return rule.icon;
  }
  return Briefcase;
}

function DepartmentSymbol({ name }: { name: string }) {
  const Icon = iconForDepartment(name);
  return (
    <div
      className="flex w-7 shrink-0 self-stretch items-center justify-center rounded-md border border-black/10 bg-[#3D421F]/[0.07] text-[#3D421F]"
      title={name}
      aria-hidden
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
    </div>
  );
}

function PunchRowPhotos({
  photos,
}: {
  photos: PunchScoreStaffPhoto[] | undefined;
}) {
  const shown = (photos ?? []).slice(0, 3);
  if (shown.length === 0) return null;

  if (shown.length === 1) {
    const person = shown[0]!;
    return (
      <StaffPhotoThumbnail
        fullName={person.fullName}
        photoUrl={person.photoUrl}
        size="fill"
        className="my-0 w-7 self-stretch rounded-md"
        empNo={person.empNo}
        department={person.departmentName}
        position={person.positionName}
        employeeStatus={person.employmentStatusName}
        workingStatus={person.workingStatusName}
        nationality={person.nationalityName}
        dob={person.dob}
        joiningDate={person.joiningDate}
        terminationDate={person.terminationDate}
      />
    );
  }

  const overlapPx = 6;
  const widthRem = 1.75 + ((shown.length - 1) * overlapPx) / 16;

  return (
    <div
      className="relative shrink-0 self-stretch"
      style={{ width: `${widthRem}rem` }}
    >
      {shown.map((person, index) => (
        <StaffPhotoThumbnail
          key={person.empNo}
          fullName={person.fullName}
          photoUrl={person.photoUrl}
          size="fill"
          className={cn(
            "absolute inset-y-0 my-0 w-7 rounded-md border border-white/80 shadow-sm",
            index === 0 ? "left-0 z-[3]" : null,
            index === 1 ? "left-1.5 z-[2]" : null,
            index === 2 ? "left-3 z-[1]" : null,
          )}
          empNo={person.empNo}
          department={person.departmentName}
          position={person.positionName}
          employeeStatus={person.employmentStatusName}
          workingStatus={person.workingStatusName}
          nationality={person.nationalityName}
          dob={person.dob}
          joiningDate={person.joiningDate}
          terminationDate={person.terminationDate}
        />
      ))}
    </div>
  );
}

function punchPctTone(pct: number): string {
  if (pct >= 80) return PCT_TEXT.best;
  if (pct >= 50) return PCT_TEXT.mixed;
  return PCT_TEXT.worst;
}

function punchBarGradient(pct: number): string {
  if (pct >= 80) return BAR_GRADIENTS.best;
  if (pct >= 50) return BAR_GRADIENTS.mixed;
  return BAR_GRADIENTS.worst;
}

function DepartmentPunchDialog({
  departmentName,
  staff,
  departmentPct,
  departmentDetail,
  payrollPeriod,
  onClose,
}: {
  departmentName: string;
  staff: PunchScoreStaffPoint[];
  departmentPct: number;
  departmentDetail: string;
  payrollPeriod: { periodStart: string; periodEnd: string } | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const Icon = iconForDepartment(departmentName);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-xl border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/95 shadow-xl backdrop-blur-xl",
          staff.length > 6 ? "max-w-3xl" : "max-w-xl",
          "max-h-[96vh]",
        )}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-black/10 bg-white/70 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-[#3D421F]/[0.07] text-[#3D421F]">
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="truncate font-serif text-lg text-[#3D421F]"
            >
              {departmentName}
            </h2>
            <p className="mt-0.5 text-xs text-black/55">{departmentDetail}</p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold tabular-nums",
                punchPctTone(departmentPct),
              )}
            >
              Dept average {formatPct(departmentPct)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/[0.05] hover:text-black/70"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul
          className={cn(
            "min-h-0 flex-1 gap-1.5 overflow-y-auto px-3 py-3",
            staff.length > 4
              ? "grid grid-cols-1 sm:grid-cols-2"
              : "flex flex-col",
          )}
        >
          {staff.length === 0 ? (
            <li className="rounded-lg border border-dashed border-black/10 bg-white/50 px-4 py-8 text-center text-sm text-black/45 sm:col-span-full">
              No staff punch scores for this department.
            </li>
          ) : (
            staff.map((row, index) => (
              <li key={row.staffId} className="min-w-0">
                <div className="flex h-full items-stretch gap-2 rounded-lg border border-black/5 bg-white/70 px-2 py-1.5">
                  <StaffPhotoThumbnail
                    fullName={row.fullName}
                    photoUrl={row.photoUrl}
                    size="fill"
                    className="my-0 w-9 self-stretch rounded-md"
                    empNo={row.empNo}
                    department={row.departmentName}
                    position={row.positionName}
                    employeeStatus={row.employmentStatusName}
                    workingStatus={row.workingStatusName}
                    nationality={row.nationalityName}
                    dob={row.dob}
                    joiningDate={row.joiningDate}
                    terminationDate={row.terminationDate}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#3D421F]">
                          <span className="mr-1.5 tabular-nums text-black/35">
                            {index + 1}.
                          </span>
                          {payrollPeriod ? (
                            <ScopedLink
                              href={validationHrefForStaff(
                                row.staffId,
                                payrollPeriod.periodStart,
                                payrollPeriod.periodEnd,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open attendance validation for ${firstLastName(row.fullName)}`}
                              className="text-[var(--venue-primary,#6B7B3A)] underline decoration-[var(--venue-primary,#6B7B3A)]/35 underline-offset-2 transition hover:decoration-[var(--venue-primary,#6B7B3A)]"
                            >
                              {firstLastName(row.fullName)}
                            </ScopedLink>
                          ) : (
                            firstLastName(row.fullName)
                          )}
                          <span className="mx-1 text-black/25" aria-hidden>
                            (
                          </span>
                          <StaffDirectoryLink
                            staffId={row.staffId}
                            empNo={row.empNo}
                            className="inline font-normal"
                          />
                          <span className="text-black/25" aria-hidden>
                            )
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-black/50">
                          {row.positionName ?? "—"}
                          <span className="mx-1 text-black/25" aria-hidden>
                            ·
                          </span>
                          {row.completeDayCount}/{row.dayCount} shift days
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-semibold tabular-nums",
                          punchPctTone(row.punchCompletePct),
                        )}
                      >
                        {formatPct(row.punchCompletePct)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, row.punchCompletePct))}%`,
                          backgroundImage: punchBarGradient(
                            row.punchCompletePct,
                          ),
                        }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function PunchScoreBarList({
  title,
  subtitle,
  data,
  emptyLabel,
  accent = "mixed",
  spread = false,
}: {
  title: string;
  subtitle: string;
  data: PunchBarPoint[];
  emptyLabel: string;
  accent?: "mixed" | "best" | "worst";
  /** Stretch rows evenly to fill the card body height. */
  spread?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-4 shrink-0">
        <h3 className="font-serif text-base text-[#3D421F]">{title}</h3>
        <p className="mt-1 text-xs text-black/50">{subtitle}</p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 bg-white/40 px-4 py-10 text-center text-sm text-black/45">
          {emptyLabel}
        </div>
      ) : (
        <ul
          className={cn(
            "flex min-h-0 flex-col",
            spread ? "flex-1 justify-between" : "gap-2.5",
          )}
        >
          {data.map((entry, index) => {
            const row = (
              <div className="flex w-full items-stretch gap-1.5">
                {entry.departmentSymbol ? (
                  <DepartmentSymbol name={entry.departmentSymbol} />
                ) : (
                  <PunchRowPhotos photos={entry.photos} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-[#3D421F] [overflow-wrap:anywhere]">
                        <span className="mr-1.5 tabular-nums text-black/35">
                          {index + 1}.
                        </span>
                        {entry.validationHref ? (
                          <ScopedLink
                            href={entry.validationHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open attendance validation for ${entry.label}`}
                            className="text-[var(--venue-primary,#6B7B3A)] underline decoration-[var(--venue-primary,#6B7B3A)]/35 underline-offset-2 transition hover:decoration-[var(--venue-primary,#6B7B3A)]"
                          >
                            {entry.label}
                          </ScopedLink>
                        ) : entry.onOpen ? (
                          <span className="text-[var(--venue-primary,#6B7B3A)] underline decoration-[var(--venue-primary,#6B7B3A)]/35 underline-offset-2">
                            {entry.label}
                          </span>
                        ) : (
                          entry.label
                        )}
                        {entry.secondary ? (
                          <span className="ml-1.5 font-normal text-[11px] text-black/45">
                            · {entry.secondary}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums leading-snug",
                        PCT_TEXT[accent],
                      )}
                    >
                      {formatPct(entry.pct)}
                    </span>
                  </div>
                  <div className="h-2 min-h-2 w-full shrink-0 overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className="h-full min-h-2 rounded-full transition-[width] duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(100, entry.pct))}%`,
                        backgroundImage: BAR_GRADIENTS[accent],
                      }}
                    />
                  </div>
                </div>
              </div>
            );

            return (
              <li key={entry.key} className="min-w-0" title={entry.detail}>
                {entry.onOpen ? (
                  <button
                    type="button"
                    onClick={entry.onOpen}
                    className="w-full rounded-md text-left transition hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#6B7B3A)]/40"
                    aria-label={`Open punch insights for ${entry.label}`}
                  >
                    {row}
                  </button>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

type AttendanceInsightsPunchChartsProps = {
  staffRows: PunchScoreStaffPoint[];
  departmentRows: PunchScoreDepartmentPoint[];
  payrollPeriodStartDay: number;
  payrollPeriodEndDay: number;
};

function toPhoto(row: PunchScoreStaffPoint): PunchScoreStaffPhoto {
  return {
    empNo: row.empNo,
    fullName: row.fullName,
    photoUrl: row.photoUrl,
    departmentName: row.departmentName,
    positionName: row.positionName,
    employmentStatusName: row.employmentStatusName,
    workingStatusName: row.workingStatusName,
    nationalityName: row.nationalityName,
    dob: row.dob,
    joiningDate: row.joiningDate,
    terminationDate: row.terminationDate,
  };
}

function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function validationHrefForStaff(
  staffId: string,
  periodStart: string,
  periodEnd: string,
): string {
  const params = new URLSearchParams({
    staffId,
    from: periodStart,
    to: periodEnd,
  });
  return `/hr/attendance/validation?${params.toString()}`;
}

export function AttendanceInsightsPunchCharts({
  staffRows,
  departmentRows,
  payrollPeriodStartDay,
  payrollPeriodEndDay,
}: AttendanceInsightsPunchChartsProps) {
  const [openDepartment, setOpenDepartment] = useState<string | null>(null);

  const payrollPeriod = useMemo(() => {
    const settings = mergePayrollSettings({
      periodStartDay: payrollPeriodStartDay,
      periodEndDay: payrollPeriodEndDay,
    });
    try {
      const month = payrollMonthContainingDate(todayIsoLocal(), settings);
      return resolvePayrollPeriod(month, settings);
    } catch {
      return null;
    }
  }, [payrollPeriodStartDay, payrollPeriodEndDay]);

  const departmentData = useMemo<PunchBarPoint[]>(() => {
    return [...departmentRows]
      .sort((a, b) => b.punchCompletePct - a.punchCompletePct)
      .map((row) => ({
        key: row.departmentName,
        label: row.departmentName,
        secondary: `${row.staffCount} staff · ${row.completeDayCount}/${row.dayCount} shift days`,
        pct: row.punchCompletePct,
        detail: `${row.departmentName} · ${row.staffCount} staff · ${row.completeDayCount}/${row.dayCount} complete shift days`,
        departmentSymbol: row.departmentName,
        onOpen: () => setOpenDepartment(row.departmentName),
      }));
  }, [departmentRows]);

  const openDepartmentRow = useMemo(
    () =>
      openDepartment
        ? departmentRows.find((row) => row.departmentName === openDepartment) ??
          null
        : null,
    [departmentRows, openDepartment],
  );

  const openDepartmentStaff = useMemo(() => {
    if (!openDepartment) return [];
    return staffRows
      .filter((row) => row.departmentName === openDepartment)
      .sort((a, b) => {
        if (b.punchCompletePct !== a.punchCompletePct) {
          return b.punchCompletePct - a.punchCompletePct;
        }
        return a.fullName.localeCompare(b.fullName);
      });
  }, [openDepartment, staffRows]);

  const rankingPool = useMemo(() => {
    const withMinDays = staffRows.filter(
      (row) => row.dayCount >= MIN_DAYS_FOR_RANKING,
    );
    return withMinDays.length >= BEST_COUNT ? withMinDays : staffRows;
  }, [staffRows]);

  const bestData = useMemo<PunchBarPoint[]>(() => {
    return [...rankingPool]
      .sort((a, b) => {
        if (b.punchCompletePct !== a.punchCompletePct) {
          return b.punchCompletePct - a.punchCompletePct;
        }
        return b.dayCount - a.dayCount;
      })
      .slice(0, BEST_COUNT)
      .map((row) => ({
        key: row.empNo,
        label: firstLastName(row.fullName),
        secondary: `${row.departmentName} · ${row.completeDayCount}/${row.dayCount} shift days`,
        pct: row.punchCompletePct,
        detail: `${row.fullName} · ${row.departmentName} · ${row.completeDayCount}/${row.dayCount} complete shift days`,
        photos: [toPhoto(row)],
        validationHref: payrollPeriod
          ? validationHrefForStaff(
              row.staffId,
              payrollPeriod.periodStart,
              payrollPeriod.periodEnd,
            )
          : `/hr/attendance/validation?staffId=${encodeURIComponent(row.staffId)}`,
      }));
  }, [rankingPool, payrollPeriod]);

  const worstData = useMemo<PunchBarPoint[]>(() => {
    return [...rankingPool]
      .sort((a, b) => {
        if (a.punchCompletePct !== b.punchCompletePct) {
          return a.punchCompletePct - b.punchCompletePct;
        }
        return b.dayCount - a.dayCount;
      })
      .slice(0, WORST_COUNT)
      .map((row) => ({
        key: row.empNo,
        label: firstLastName(row.fullName),
        secondary: `${row.departmentName} · ${row.completeDayCount}/${row.dayCount} shift days`,
        pct: row.punchCompletePct,
        detail: `${row.fullName} · ${row.departmentName} · ${row.completeDayCount}/${row.dayCount} complete shift days`,
        photos: [toPhoto(row)],
        validationHref: payrollPeriod
          ? validationHrefForStaff(
              row.staffId,
              payrollPeriod.periodStart,
              payrollPeriod.periodEnd,
            )
          : `/hr/attendance/validation?staffId=${encodeURIComponent(row.staffId)}`,
      }));
  }, [rankingPool, payrollPeriod]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-serif text-lg text-[#3D421F]">
          <span className="inline-flex items-center gap-2">
            <Fingerprint
              className="h-5 w-5 shrink-0 text-[var(--venue-primary,#818a40)]"
              aria-hidden
            />
            Attendance Punch Score
          </span>
        </h3>
        <p className="text-sm text-black/50">
          Complete punches ÷ roster SHIFT days. Leave, day off, and absence days
          are excluded.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <PunchScoreBarList
          title="By department"
          subtitle="Average on SHIFT days only"
          data={departmentData}
          emptyLabel="No department punch scores for this filter."
          accent="mixed"
          spread
        />
        <PunchScoreBarList
          title="Best punchers"
          subtitle={`Top ${BEST_COUNT} by completeness`}
          data={bestData}
          emptyLabel="No staff punch scores for this filter."
          accent="best"
        />
        <PunchScoreBarList
          title="Worst punchers"
          subtitle={`Bottom ${WORST_COUNT} by completeness`}
          data={worstData}
          emptyLabel="No staff punch scores for this filter."
          accent="worst"
        />
      </div>

      {openDepartment && openDepartmentRow ? (
        <DepartmentPunchDialog
          departmentName={openDepartment}
          staff={openDepartmentStaff}
          departmentPct={openDepartmentRow.punchCompletePct}
          departmentDetail={`${openDepartmentRow.staffCount} staff · ${openDepartmentRow.completeDayCount}/${openDepartmentRow.dayCount} complete shift days`}
          payrollPeriod={payrollPeriod}
          onClose={() => setOpenDepartment(null)}
        />
      ) : null}
    </div>
  );
}
