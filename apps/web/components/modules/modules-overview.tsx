"use client";

import { ModuleGrid } from "@/components/modules/module-grid";
import type {
  ModuleCategory,
  ModuleOverviewItem,
} from "@/lib/modules-registry";

export type ModuleGridItem = ModuleOverviewItem & {
  clickable: boolean;
};

type ModulesOverviewProps = {
  sections: {
    category: ModuleCategory;
    modules: ModuleGridItem[];
  }[];
};

export function ModulesOverview({ sections }: ModulesOverviewProps) {
  return (
    <div className="space-y-10">
      {sections.map(({ category, modules }) => (
        <section key={category.key} className="space-y-4">
          <header className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-black/45">
              {category.label}
            </h2>
            <div className="h-px w-full bg-black/10" aria-hidden />
          </header>
          <ModuleGrid modules={modules} />
        </section>
      ))}
    </div>
  );
}
