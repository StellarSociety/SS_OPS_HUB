"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Earth, X } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import type { HrContinentRow } from "@/lib/hr/overview";
import { cn } from "@/lib/utils";

const CONTINENT_COLORS: Record<string, string> = {
  Asia: "#8FA34A",
  Africa: "#D4724A",
  Europe: "#5B87A8",
  "North America": "#E0A84A",
  "South America": "#C96B6B",
  Oceania: "#4FA89A",
  Unspecified: "#A3A89A",
};

const FALLBACK_COLORS = [
  "#8FA34A",
  "#D4724A",
  "#5B87A8",
  "#E0A84A",
  "#C96B6B",
  "#4FA89A",
  "#9B7EAE",
  "#A3A89A",
];

const PANEL_WIDTH = 256;

/** Darken a hex color toward black by `amount` (0–1). */
function shadeHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const channel = (i: number) => {
    const value = Number.parseInt(raw.slice(i, i + 2), 16);
    return Math.round(value * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** Lighten a hex color toward white by `amount` (0–1). */
function lightenHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const channel = (i: number) => {
    const value = Number.parseInt(raw.slice(i, i + 2), 16);
    return Math.round(value + (255 - value) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

type Slice = {
  name: string;
  count: number;
  percent: number;
  color: string;
  staff: {
    staffId: string;
    empNo: string;
    fullName: string;
    country: string;
  }[];
};

type OpenPanel = {
  slice: Slice;
  left: number;
  top: number;
};

type ContinentBreakdownChartProps = {
  rows: HrContinentRow[];
  title?: string;
};

function clampPanelPosition(clientX: number, clientY: number) {
  const margin = 8;
  const maxLeft = window.innerWidth - PANEL_WIDTH - margin;
  const left = Math.min(Math.max(clientX, margin), Math.max(margin, maxLeft));
  const top = Math.min(
    Math.max(clientY, margin),
    Math.max(margin, window.innerHeight - margin - 48),
  );
  return { left, top };
}

export function ContinentBreakdownChart({
  rows,
  title = "Top continents",
}: ContinentBreakdownChartProps) {
  const panelId = useId();
  const gradientId = useId().replace(/:/g, "");
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const data: Slice[] = rows.map((row, index) => ({
    name: row.label,
    count: row.count,
    percent: row.percent,
    staff: row.staff,
    color:
      CONTINENT_COLORS[row.label] ??
      FALLBACK_COLORS[index % FALLBACK_COLORS.length]!,
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!openPanel) {
      setPanelVisible(false);
      return;
    }
    const frame = requestAnimationFrame(() => setPanelVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [openPanel]);

  useEffect(() => {
    if (!openPanel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanel]);

  function closePanel() {
    setPanelVisible(false);
    setSelectedIndex(undefined);
    window.setTimeout(() => setOpenPanel(null), 180);
  }

  function openFromPoint(
    slice: Slice,
    index: number,
    clientX: number,
    clientY: number,
  ) {
    if (selectedIndex === index && openPanel) {
      closePanel();
      return;
    }
    setSelectedIndex(index);
    setPanelVisible(false);
    setOpenPanel({
      slice,
      ...clampPanelPosition(clientX, clientY),
    });
  }

  const overlay =
    mounted && openPanel
      ? createPortal(
          <div
            className="fixed inset-0 z-[200]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={panelId}
          >
            <button
              type="button"
              aria-label="Close employee list"
              className={cn(
                "absolute inset-0 bg-black/20 transition-opacity duration-200",
                panelVisible ? "opacity-100" : "opacity-0",
              )}
              onClick={closePanel}
            />
            <div
              className={cn(
                "fixed max-h-[min(20rem,70vh)] w-64 overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl transition-[opacity,transform] duration-200 ease-out",
                panelVisible ? "opacity-100" : "opacity-0",
              )}
              style={{
                left: openPanel.left,
                top: openPanel.top,
                transformOrigin: "0 0",
                transform: panelVisible
                  ? "translate(-8px, -8px) scale(1)"
                  : "translate(-8px, -8px) scale(0.35)",
              }}
            >
              <div className="flex items-start gap-2 border-b border-black/8 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p
                    id={panelId}
                    className="truncate text-xs font-semibold text-[#3D421F]"
                  >
                    {openPanel.slice.name}
                  </p>
                  <p className="text-[10px] tabular-nums text-black/50">
                    {openPanel.slice.count} staff · {openPanel.slice.percent}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded p-0.5 text-black/40 transition hover:bg-black/[0.05] hover:text-black/70"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="max-h-[min(16rem,55vh)] space-y-0.5 overflow-y-auto px-2 py-1.5">
                {openPanel.slice.staff.map((person) => (
                  <li key={person.staffId}>
                    <Link
                      href={`/hr/${person.staffId}`}
                      className="flex items-baseline gap-1.5 rounded px-1.5 py-1 text-[11px] transition hover:bg-black/[0.04]"
                      onClick={closePanel}
                    >
                      <span className="shrink-0 font-semibold text-[var(--venue-primary,#6B7B3A)]">
                        {person.empNo}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[#3D421F]">
                        {person.fullName}
                      </span>
                      <span className="max-w-[5.5rem] shrink-0 truncate text-right text-black/45">
                        {person.country}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Card className="relative flex h-full min-h-[19rem] flex-col overflow-hidden p-4">
        <div className="flex items-center gap-1.5">
          <Earth className="h-4 w-4 shrink-0 text-[#3D421F]/70" aria-hidden />
          <h3 className="font-serif text-base text-[#3D421F]">{title}</h3>
        </div>
        <hr className="mt-2 shrink-0 border-t-2 border-black/15" />

        {total > 0 ? (
          <div className="mt-1 flex min-h-0 flex-1 gap-2">
            <div className="relative min-h-0 min-w-0 flex-[1.6]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <defs>
                    {data.map((slice, index) => (
                      <linearGradient
                        key={slice.name}
                        id={`${gradientId}-${index}`}
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor={lightenHex(slice.color, 0.42)}
                        />
                        <stop offset="48%" stopColor={slice.color} />
                        <stop
                          offset="100%"
                          stopColor={shadeHex(slice.color, 0.28)}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="38%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="#F7F6F0"
                    strokeWidth={2}
                    onClick={(entry, index, e) => {
                      const slice = (entry as { payload?: Slice }).payload;
                      if (!slice) return;
                      openFromPoint(slice, index, e.clientX, e.clientY);
                    }}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    {data.map((slice, index) => (
                      <Cell
                        key={slice.name}
                        fill={`url(#${gradientId}-${index})`}
                        stroke={
                          selectedIndex === index
                            ? shadeHex(slice.color, 0.35)
                            : "#F7F6F0"
                        }
                        strokeWidth={selectedIndex === index ? 2.5 : 2}
                        fillOpacity={
                          selectedIndex == null || selectedIndex === index
                            ? 1
                            : 0.4
                        }
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                  Total
                </span>
                <span className="text-base font-semibold tabular-nums text-[#3D421F]">
                  {total}
                </span>
              </div>
            </div>

            <ul className="flex min-h-0 w-[36%] shrink-0 flex-col justify-center gap-1 overflow-y-auto py-1">
              {data.map((slice, index) => (
                <li key={slice.name}>
                  <button
                    type="button"
                    onClick={(e) =>
                      openFromPoint(slice, index, e.clientX, e.clientY)
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition hover:bg-black/[0.04]",
                      selectedIndex === index && "bg-black/[0.06]",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-[#3D421F]">
                      {slice.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-black/55">
                      {slice.count}
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-black/40">
                      {slice.percent}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-3 flex flex-1 items-center justify-center text-xs text-black/45">
            No continent data
          </div>
        )}
      </Card>
      {overlay}
    </>
  );
}
