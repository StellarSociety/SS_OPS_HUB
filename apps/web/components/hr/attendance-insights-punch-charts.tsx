"use client";

import { useMemo } from "react";
import { Fingerprint } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PunchScoreStaffPoint = {
  empNo: string;
  fullName: string;
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

function PunchScoreBarList({
  title,
  subtitle,
  data,
  emptyLabel,
  accent = "mixed",
}: {
  title: string;
  subtitle: string;
  data: PunchBarPoint[];
  emptyLabel: string;
  accent?: "mixed" | "best" | "worst";
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-4">
        <h3 className="font-serif text-base text-[#3D421F]">{title}</h3>
        <p className="mt-1 text-xs text-black/50">{subtitle}</p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 bg-white/40 px-4 py-10 text-center text-sm text-black/45">
          {emptyLabel}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {data.map((entry, index) => (
            <li key={entry.key} className="min-w-0" title={entry.detail}>
              <div className="mb-1 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-[#3D421F] [overflow-wrap:anywhere]">
                    <span className="mr-1.5 tabular-nums text-black/35">
                      {index + 1}.
                    </span>
                    {entry.label}
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type AttendanceInsightsPunchChartsProps = {
  staffRows: PunchScoreStaffPoint[];
  departmentRows: PunchScoreDepartmentPoint[];
};

export function AttendanceInsightsPunchCharts({
  staffRows,
  departmentRows,
}: AttendanceInsightsPunchChartsProps) {
  const departmentData = useMemo<PunchBarPoint[]>(() => {
    return [...departmentRows]
      .sort((a, b) => b.punchCompletePct - a.punchCompletePct)
      .map((row) => ({
        key: row.departmentName,
        label: row.departmentName,
        secondary: `${row.staffCount} staff · ${row.completeDayCount}/${row.dayCount} shift days`,
        pct: row.punchCompletePct,
        detail: `${row.departmentName} · ${row.staffCount} staff · ${row.completeDayCount}/${row.dayCount} complete shift days`,
      }));
  }, [departmentRows]);

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
      }));
  }, [rankingPool]);

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
      }));
  }, [rankingPool]);

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
    </div>
  );
}
