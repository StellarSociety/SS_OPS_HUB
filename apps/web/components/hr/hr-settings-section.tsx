import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function HrSettingsSectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="font-serif text-2xl text-[#3D421F]">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-black/60">{description}</p>
    </div>
  );
}

export type HrSettingsRoadmapItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  status?: "planned" | "soon";
};

/** Polished empty / roadmap surface for unfinished settings areas. */
export function HrSettingsRoadmap({
  items,
  footnote,
}: {
  items: readonly HrSettingsRoadmapItem[];
  footnote?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className={cn(
                "rounded-xl border border-black/10 bg-white p-4 shadow-sm",
                "transition-colors",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--venue-secondary,#F0F3DD)] text-[var(--venue-primary,#818a40)]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#3D421F]">
                      {item.title}
                    </h3>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800/90">
                      {item.status === "soon" ? "Soon" : "Planned"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-black/55">
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {footnote ? (
        <p className="text-xs text-black/40">{footnote}</p>
      ) : null}
    </div>
  );
}
