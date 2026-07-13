"use client";

import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgePercent,
  Calculator,
  CheckCircle2,
  ConciergeBell,
  GraduationCap,
  PieChart,
  Scale,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { pillSubNavLinkClass } from "@/lib/sub-nav-ui";

type DashboardTab = {
  key: string;
  label: string;
  icon: LucideIcon;
};

type DashboardsPanelProps = {
  slots?: Partial<Record<string, ReactNode>>;
};

const DASHBOARD_TABS: DashboardTab[] = [
  { key: "revenue", label: "Revenue", icon: TrendingUp },
  { key: "discounts", label: "Discounts", icon: BadgePercent },
  { key: "waiters_asph", label: "Waiters ASPH", icon: ConciergeBell },
  { key: "gp_cos", label: "GP & COS", icon: PieChart },
  { key: "accounting", label: "Accounting", icon: Calculator },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "hr", label: "HR", icon: Users },
  { key: "learning", label: "L&D", icon: GraduationCap },
  { key: "governance", label: "Governance", icon: Scale },
  { key: "approvals", label: "Approvals", icon: CheckCircle2 },
];

export function DashboardsPanel({ slots }: DashboardsPanelProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeTab = DASHBOARD_TABS.find((tab) => tab.key === activeKey) ?? null;
  const activeSlot = activeTab ? slots?.[activeTab.key] : undefined;

  // Recharts' ResponsiveContainer only measures its size once, after mount.
  // On the initial (hydrated) render inside this animated container the layout
  // isn't settled yet, so it can read a 0 size and render nothing until a real
  // remount happens. Bumping this key one frame after mount forces the active
  // content to remount against a settled layout, so charts appear immediately.
  const [mountTick, setMountTick] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMountTick(1));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Card className="p-5">
      <h2 className="text-center font-serif text-3xl text-[#3D421F]">
        Dashboards
      </h2>

      <nav
        aria-label="Dashboard views"
        className="mt-4 hidden flex-wrap items-center justify-center gap-1.5 sm:flex"
      >
        {DASHBOARD_TABS.map((tab, index) => {
          const Icon = tab.icon;
          return (
            <Fragment key={tab.key}>
              {index > 0 ? (
                <span aria-hidden className="select-none text-black/20">
                  |
                </span>
              ) : null}
              <button
                type="button"
                aria-pressed={tab.key === activeKey}
                onClick={() =>
                  setActiveKey((current) =>
                    current === tab.key ? null : tab.key,
                  )
                }
                className={pillSubNavLinkClass(tab.key === activeKey)}
              >
                <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
              </button>
            </Fragment>
          );
        })}
      </nav>

      <div className="mt-4 sm:hidden">
        <label htmlFor="dashboard-view-select" className="sr-only">
          Dashboard view
        </label>
        <select
          id="dashboard-view-select"
          value={activeKey ?? ""}
          onChange={(event) => setActiveKey(event.target.value || null)}
          className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F]"
        >
          <option value="">Select a dashboard…</option>
          {DASHBOARD_TABS.map((tab) => (
            <option key={tab.key} value={tab.key}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {activeTab ? <hr className="mt-4 border-black/10" /> : null}

      <AnimatePresence mode="wait" initial={false}>
        {activeTab ? (
          activeSlot ? (
            <motion.div
              key={`${activeTab.key}-${mountTick}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mt-5"
            >
              {activeSlot}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mt-5 flex min-h-64 items-center justify-center rounded-lg border border-dashed border-black/10 bg-white/40 p-6 text-center"
            >
              <p className="text-sm text-black/45">
                {activeTab.label} dashboards and graphs will appear here.
              </p>
            </motion.div>
          )
        ) : null}
      </AnimatePresence>
    </Card>
  );
}
