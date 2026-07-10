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
      ) : null}
    </div>
  );
}
