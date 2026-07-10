import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getModuleNavItems } from "@/lib/modules-registry";

export default function ModulesPage() {
  const modules = getModuleNavItems();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Modules</h1>
        <p className="mt-1 text-sm text-black/60">
          Operational workflows plug in here as independent modules.
        </p>
      </div>
      {modules.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-serif text-xl text-[#3D421F]">No modules yet</p>
          <p className="mt-2 text-sm text-black/50">
            HR, Sales, Checklists, and other modules will be added one at a
            time.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.key} href={mod.href}>
                <Card className="flex h-full flex-col gap-3 p-5 transition hover:border-[var(--venue-primary)]/40 hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    {Icon ? (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--venue-primary)]/15 text-[#3D421F]">
                        <Icon className="h-5 w-5" />
                      </span>
                    ) : null}
                    <h2 className="font-serif text-xl text-[#3D421F]">
                      {mod.label}
                    </h2>
                  </div>
                  {mod.description ? (
                    <p className="text-sm text-black/55">{mod.description}</p>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
