import { ModulesOverview } from "@/components/modules/modules-overview";
import { loadModulesHubContext } from "@/lib/modules-hub-data";

export default async function ModulesPage() {
  const {
    venue,
    isGlobal,
    userName,
    sections,
    settingsSections,
    globalSettingsTile,
  } = await loadModulesHubContext();

  const displaySections = isGlobal ? settingsSections : sections;

  return (
    <div className="mx-auto max-w-6xl">
      <ModulesOverview
        venue={venue}
        isGlobal={isGlobal}
        userName={userName}
        sections={displaySections}
        trailingItem={isGlobal ? globalSettingsTile : null}
      />
    </div>
  );
}
