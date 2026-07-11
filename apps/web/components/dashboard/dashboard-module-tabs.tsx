"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  LayoutGrid,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ModuleGrid } from "@/components/modules/module-grid";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import type { ModuleCategory, ModuleCategoryKey } from "@/lib/modules-registry";
import {
  moduleBrandedNavIconClass,
  moduleBrandedNavLinkClass,
  subNavLabelClass,
} from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

export type DashboardCategorySection = {
  category: ModuleCategory;
  modules: ModuleGridItem[];
};

type DashboardModuleTabsProps = {
  sections: DashboardCategorySection[];
  settingsHref?: string;
  settingsLabel?: string;
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
  settingsHref = "/settings",
  settingsLabel = "Venue Settings",
}: DashboardModuleTabsProps) {
  const [activeKey, setActiveKey] = useState<ModuleCategoryKey | null>(null);

  const activeSection = sections.find(
    (section) => section.category.key === activeKey,
  );

  if (sections.length === 0) {
    return null;
  }

  return (
    <div>
      <hr className="mt-4 border-black/10" />
      <nav
        aria-label="App categories"
        className="mt-4 flex w-full flex-wrap items-center justify-between gap-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          {sections.map((section) => {
            const Icon = CATEGORY_ICONS[section.category.key];
            const active = section.category.key === activeKey;
            return (
              <button
                key={section.category.key}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setActiveKey((current) =>
                    current === section.category.key
                      ? null
                      : section.category.key,
                  )
                }
                className={tabClass(active)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="whitespace-nowrap">
                  {section.category.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Link href={settingsHref} className={moduleBrandedNavLinkClass(false)}>
            <Settings className={moduleBrandedNavIconClass(false)} aria-hidden />
            <span className="whitespace-nowrap">{settingsLabel}</span>
          </Link>
        </div>
      </nav>
      <hr className="mt-4 border-black/10" />

      <AnimatePresence mode="wait">
        {activeSection ? (
          <motion.div
            key={activeSection.category.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-6"
          >
            {activeSection.modules.length > 0 ? (
              <ModuleGrid modules={activeSection.modules} />
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
