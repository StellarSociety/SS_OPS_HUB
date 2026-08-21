import { ModuleIcon } from "@/components/modules/module-icon";
import type { ModuleGridItem } from "@/components/modules/modules-overview";

type ModuleExplanationsProps = {
  modules: ModuleGridItem[];
};

export function ModuleExplanations({ modules }: ModuleExplanationsProps) {
  if (modules.length === 0) return null;

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-black/45">
          About these apps
        </h2>
        <div className="h-px w-full bg-black/10" aria-hidden />
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((mod) => (
          <li
            key={mod.key}
            className="flex items-start gap-3 rounded-xl border border-black/5 bg-white/50 p-4 backdrop-blur-sm"
          >
            <ModuleIcon
              iconKey={mod.iconKey}
              className="h-9 w-9 shrink-0"
            />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-[#3D421F]">
                  {mod.label}
                </h3>
                {mod.status === "coming_soon" && (
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/45">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-black/60">
                {mod.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
