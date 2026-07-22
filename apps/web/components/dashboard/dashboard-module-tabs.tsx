"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  LayoutDashboard,
  LayoutGrid,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ExpandableModuleGrid } from "@/components/modules/expandable-module-grid";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import type { ModuleCategory, ModuleCategoryKey } from "@/lib/modules-registry";
import { subNavLabelClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

export type DashboardCategorySection = {
  category: ModuleCategory;
  modules: ModuleGridItem[];
};

const DASHBOARDS_KEY = "dashboards";

type TabKey = ModuleCategoryKey | typeof DASHBOARDS_KEY;

type DashboardModuleTabsProps = {
  sections: DashboardCategorySection[];
  dashboardsPanel?: ReactNode;
};

const CATEGORY_ICONS: Record<ModuleCategoryKey, LucideIcon> = {
  operational: LayoutGrid,
  revenue: TrendingUp,
  people: Users,
  management: Building2,
};

function tabClass(active: boolean) {
  return cn(
    "inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-lg border px-3 shadow-sm backdrop-blur-md transition-colors",
    subNavLabelClass,
    active
      ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/20 text-[#3D421F] ring-1 ring-[var(--venue-primary)]/20"
      : "border-black/10 bg-white/60 text-black/55 hover:bg-white/80 hover:text-[#3D421F]",
  );
}

export function DashboardModuleTabs({
  sections,
  dashboardsPanel,
}: DashboardModuleTabsProps) {
  const [activeKey, setActiveKey] = useState<TabKey | null>(null);

  const activeSection = sections.find(
    (section) => section.category.key === activeKey,
  );
  const dashboardsActive = activeKey === DASHBOARDS_KEY;

  if (sections.length === 0 && !dashboardsPanel) {
    return null;
  }

  const toggleKey = (key: TabKey) =>
    setActiveKey((current) => (current === key ? null : key));

  return (
    <div>
      <nav
        aria-label="App categories"
        className="flex w-full flex-wrap items-center justify-center gap-2"
      >
        {dashboardsPanel ? (
          <button
            type="button"
            aria-pressed={dashboardsActive}
            onClick={() => toggleKey(DASHBOARDS_KEY)}
            className={tabClass(dashboardsActive)}
          >
            <LayoutDashboard
              className="h-3.5 w-3.5 shrink-0 opacity-80"
              aria-hidden
            />
            <span className="whitespace-nowrap">Dashboards</span>
          </button>
        ) : null}

        {sections.map((section) => {
          const Icon = CATEGORY_ICONS[section.category.key];
          const active = section.category.key === activeKey;
          return (
            <button
              key={section.category.key}
              type="button"
              aria-pressed={active}
              onClick={() => toggleKey(section.category.key)}
              className={tabClass(active)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="whitespace-nowrap">
                {section.category.label}
              </span>
            </button>
          );
        })}
      </nav>
      <hr className="mt-4 border-black/10" />

      <AnimatePresence mode="wait">
        {dashboardsActive ? (
          <motion.div
            key={DASHBOARDS_KEY}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-6"
          >
            {dashboardsPanel}
          </motion.div>
        ) : activeSection ? (
          <motion.div
            key={activeSection.category.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-6"
          >
            {activeSection.modules.length > 0 ? (
              <ExpandableModuleGrid
                modules={activeSection.modules}
                centered
              />
            ) : (
              <p className="py-8 text-center text-sm text-black/50">
                No apps in this category yet.
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
