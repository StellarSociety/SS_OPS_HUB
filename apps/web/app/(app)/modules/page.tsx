import { ModulesOverview } from "@/components/modules/modules-overview";
import { loadModulesHubContext } from "@/lib/modules-hub-data";

export default async function ModulesPage() {
  const { venue, sections } = await loadModulesHubContext();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-3xl text-[#3D421F]">Apps Hub</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-black/60">
          Pick an app to manage lists, revenue, people, and governance workflows
          at {venue.name}.
        </p>
      </div>

      <ModulesOverview sections={sections} />
    </div>
  );
}
