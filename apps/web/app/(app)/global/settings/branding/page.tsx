import { GroupLogoPanel } from "@/components/settings/group-logo-panel";
import { fetchGroupLogoState } from "@/lib/group/branding";

export default async function GlobalBrandingIndexPage() {
  const initial = await fetchGroupLogoState();
  return <GroupLogoPanel initial={initial} />;
}
