import { ModulesOverview } from "@/components/modules/modules-overview";
import { loadModulesHubContext } from "@/lib/modules-hub-data";

export default async function ModulesPage() {
  const { venue, isGlobal, sections, settingsSections, globalSettingsTile } =
    await loadModulesHubContext();

  const displaySections = isGlobal ? settingsSections : sections;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-3xl text-[#3D421F]">
          {isGlobal ? "App Settings" : "Apps Hub"}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-black/60">
          {isGlobal
            ? "Pick an app to manage its settings across all venues, or open Global Settings for organisation-wide options."
            : `Pick an app to manage lists, revenue, people, and governance workflows at ${venue.name}.`}
        </p>
      </div>

      <ModulesOverview
        sections={displaySections}
        trailingItem={isGlobal ? globalSettingsTile : null}
      />
    </div>
  );
}
