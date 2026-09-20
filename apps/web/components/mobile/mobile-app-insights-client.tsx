"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { listMobileAppInsights } from "@/lib/actions/mobile-usage";
import {
  dubaiTodayIso,
  shiftIsoDate,
  type MobileAppInsights,
  type MobileAppInsightsBar,
} from "@/lib/mobile/usage";
import { cn } from "@/lib/utils";

const BAR_FILL = "#818a40";
const BAR_FILL_DARK = "#3D421F";

export function MobileAppInsightsClient({
  initial,
}: {
  initial: MobileAppInsights;
}) {
  const [periodFrom, setPeriodFrom] = useState(initial.periodFrom);
  const [periodTo, setPeriodTo] = useState(initial.periodTo);
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setData(initial);
    setPeriodFrom(initial.periodFrom);
    setPeriodTo(initial.periodTo);
  }, [initial]);

  function load(from: string, to: string) {
    startTransition(async () => {
      const next = await listMobileAppInsights({ from, to });
      setData(next);
    });
  }

  function applyRange(from: string, to: string) {
    setPeriodFrom(from);
    setPeriodTo(to);
    load(from, to);
  }

  function applyPreset(days: number) {
    const to = dubaiTodayIso();
    applyRange(shiftIsoDate(to, -(days - 1)), to);
  }

  const today = dubaiTodayIso();
  const presetDays =
    periodTo === today
      ? periodFrom === shiftIsoDate(today, -6)
        ? 7
        : periodFrom === shiftIsoDate(today, -29)
          ? 30
          : periodFrom === shiftIsoDate(today, -89)
            ? 90
            : 0
      : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        How the Home Screen app is used at this venue. Screen views are counted
        as people open each page. Edits are counted when a form is saved from
        the phone app.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="insights-from">From</Label>
          <DateInput
            id="insights-from"
            value={periodFrom}
            onChange={(value) => {
              if (!value) return;
              applyRange(value, periodTo);
            }}
            maxDate={periodTo}
            className="w-40"
            inputClassName="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="insights-to">To</Label>
          <DateInput
            id="insights-to"
            value={periodTo}
            onChange={(value) => {
              if (!value) return;
              applyRange(periodFrom, value);
            }}
            maxDate={today}
            className="w-40"
            inputClassName="h-10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => applyPreset(days)}
              className={cn(
                "h-10 rounded-lg border px-3 text-sm",
                presetDays === days
                  ? "border-transparent bg-[var(--venue-primary,#818a40)] text-white"
                  : "border-black/10 bg-white text-[#3D421F] hover:bg-black/5",
              )}
            >
              {days} days
            </button>
          ))}
        </div>
        {pending ? (
          <p className="pb-2 text-xs text-black/45">Updating…</p>
        ) : null}
      </div>

      <div className="flex flex-nowrap items-stretch gap-3">
        <Stat label="Active people" value={data.totals.activeUsers} />
        <Stat label="Screen views" value={data.totals.views} />
        <Stat label="Edits" value={data.totals.edits} />
        <Stat label="Departments" value={data.totals.departments} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Who is using the most">
          {data.people.length === 0 ? (
            <Empty />
          ) : (
            <PeopleList people={data.people} />
          )}
        </Panel>

        <Panel title="Department usage">
          <UsageBarChart
            data={data.departments}
            empty={<Empty />}
            layout="vertical"
          />
        </Panel>

        <Panel title="Pages viewed the most">
          <UsageBarChart
            data={data.pagesViewed}
            empty={<Empty />}
            layout="vertical"
          />
        </Panel>

        <Panel title="Pages and forms edited the most">
          <UsageBarChart
            data={data.pagesEdited}
            empty={
              <Empty message="No form saves from the phone app in this period." />
            }
            fill={BAR_FILL_DARK}
            layout="vertical"
          />
        </Panel>

        <Panel title="Daily activity">
          {data.daily.every((row) => row.views === 0 && row.edits === 0) ? (
            <Empty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00000014" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    contentStyle={tooltipStyle}
                  />
                  <Bar
                    dataKey="views"
                    name="Views"
                    fill={BAR_FILL}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="edits"
                    name="Edits"
                    fill={BAR_FILL_DARK}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Busiest hours">
          <UsageBarChart
            data={data.hours}
            empty={<Empty />}
            layout="horizontal"
          />
        </Panel>

        <Panel title="Devices">
          <UsageBarChart
            data={data.platforms}
            empty={<Empty />}
            layout="vertical"
          />
        </Panel>
      </div>
    </div>
  );
}

function PeopleList({
  people,
}: {
  people: MobileAppInsights["people"];
}) {
  const max = Math.max(...people.map((row) => row.views + row.edits), 1);
  return (
    <ul className="space-y-2.5">
      {people.map((person) => {
        const total = person.views + person.edits;
        return (
          <li key={person.userId} className="flex items-center gap-3">
            <StaffPhotoThumbnail
              fullName={person.name}
              photoUrl={person.photoUrl}
              empNo={person.empNo}
              department={person.department}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-[#3D421F]">
                  {person.name}
                </p>
                <p className="shrink-0 text-xs tabular-nums text-black/50">
                  {person.views} views
                  {person.edits > 0 ? ` · ${person.edits} edits` : ""}
                </p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
                  <div
                    className="h-full rounded-full bg-[var(--venue-primary,#818a40)]"
                    style={{ width: `${Math.max(6, (total / max) * 100)}%` }}
                  />
                </div>
                {person.staffId && person.empNo ? (
                  <StaffDirectoryLink
                    staffId={person.staffId}
                    empNo={person.empNo}
                    className="text-[11px] text-black/40"
                  />
                ) : person.department ? (
                  <span className="text-[11px] text-black/40">
                    {person.department}
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UsageBarChart({
  data,
  empty,
  layout,
  fill = BAR_FILL,
}: {
  data: MobileAppInsightsBar[];
  empty: ReactNode;
  layout: "vertical" | "horizontal";
  fill?: string;
}) {
  if (data.length === 0) return <>{empty}</>;
  const height = layout === "vertical" ? Math.max(220, data.length * 36) : 256;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {layout === "vertical" ? (
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#00000014" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="label"
              width={118}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              contentStyle={tooltipStyle}
            />
            <Bar
              dataKey="count"
              name="Count"
              fill={fill}
              radius={[0, 6, 6, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#00000014" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              contentStyle={tooltipStyle}
            />
            <Bar
              dataKey="count"
              name="Opens"
              fill={fill}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive={false}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.1)",
  fontSize: 12,
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-4 py-3 text-center">
      <p className="text-2xl font-semibold tabular-nums text-[#3D421F]">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-black/50">{label}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <h3 className="mb-3 font-serif text-lg text-[#3D421F]">{title}</h3>
      {children}
    </div>
  );
}

function Empty({
  message = "No Home Screen app activity in this period yet.",
}: {
  message?: string;
}) {
  return <p className="text-sm text-black/45">{message}</p>;
}
