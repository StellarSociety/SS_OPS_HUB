"use client";

import { ModuleGrid } from "@/components/modules/module-grid";
import type {
  AppModuleState,
  ModuleCategory,
  ModuleOverviewItem,
} from "@/lib/modules-registry";

export type ModuleGridItem = Omit<ModuleOverviewItem, "status"> & {
  status: AppModuleState;
  clickable: boolean;
};

type ModulesOverviewProps = {
  sections: {
    category: ModuleCategory;
    modules: ModuleGridItem[];
  }[];
  trailingItem?: ModuleGridItem | null;
};

export function ModulesOverview({ sections, trailingItem }: ModulesOverviewProps) {
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
      {trailingItem ? (
        <section className="space-y-4">
          <div className="h-px w-full bg-black/10" aria-hidden />
          <ModuleGrid modules={[trailingItem]} />
        </section>
      ) : null}
    </div>
  );
}
