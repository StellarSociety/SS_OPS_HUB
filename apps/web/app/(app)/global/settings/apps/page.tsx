import { AppStatesPanel } from "@/components/settings/app-states-panel";
import { fetchAppModuleStates } from "@/lib/actions/app-modules";
import { requireGlobalSettingsAccess } from "@/lib/access/global-settings";

export default async function GlobalAppsSettingsPage() {
  await requireGlobalSettingsAccess();
  const items = await fetchAppModuleStates();

  return <AppStatesPanel items={items} />;
}
