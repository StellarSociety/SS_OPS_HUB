import { AppIconPanel } from "@/components/settings/app-icon-panel";
import { GroupFaviconPanel } from "@/components/settings/group-favicon-panel";
import { GroupLogoPanel } from "@/components/settings/group-logo-panel";
import { fetchGroupBrandingState } from "@/lib/group/branding";

export default async function GlobalBrandingIndexPage() {
  const initial = await fetchGroupBrandingState();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <GroupLogoPanel initial={initial} />
      <AppIconPanel initial={initial} />
      <GroupFaviconPanel initial={initial} />
    </div>
  );
}
