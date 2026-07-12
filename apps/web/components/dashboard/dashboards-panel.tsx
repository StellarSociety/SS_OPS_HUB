"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { pillSubNavLinkClass } from "@/lib/sub-nav-ui";

type DashboardTab = {
  key: string;
  label: string;
};

type DashboardsPanelProps = {
  slots?: Partial<Record<string, ReactNode>>;
};

const DASHBOARD_TABS: DashboardTab[] = [
  { key: "revenue", label: "Revenue" },
  { key: "discounts", label: "Discounts" },
  { key: "waiters_asph", label: "Waiters ASPH" },
  { key: "gp_cos", label: "GP & COS" },
  { key: "accounting", label: "Accounting" },
  { key: "maintenance", label: "Maintenance" },
  { key: "hr", label: "HR" },
  { key: "learning", label: "L&D" },
  { key: "governance", label: "Governance" },
  { key: "approvals", label: "Approvals" },
];

export function DashboardsPanel({ slots }: DashboardsPanelProps) {
  const [activeKey, setActiveKey] = useState<string>(DASHBOARD_TABS[0].key);
  const activeTab =
    DASHBOARD_TABS.find((tab) => tab.key === activeKey) ?? DASHBOARD_TABS[0];
  const activeSlot = slots?.[activeTab.key];

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
      <h2 className="font-serif text-3xl text-[#3D421F]">Dashboards</h2>

      <nav
        aria-label="Dashboard views"
        className="mt-4 flex flex-wrap items-center gap-1.5"
      >
        {DASHBOARD_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={tab.key === activeKey}
            onClick={() => setActiveKey(tab.key)}
            className={pillSubNavLinkClass(tab.key === activeKey)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <hr className="mt-4 border-black/10" />

      <AnimatePresence mode="wait" initial={false}>
        {activeSlot ? (
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
        )}
      </AnimatePresence>
    </Card>
  );
}
