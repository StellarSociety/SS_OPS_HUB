import { ExpirySettingsPanel } from "@/components/hr/settings-panels";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import { DEFAULT_HR_EXPIRY_SETTINGS, HR_SETTINGS_KEYS } from "@/lib/hr/types";

export default async function HrExpirySettingsPage() {
  const { supabase, venue } = await getHrPageContext();
  const settings = await getHrVenueSetting(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.expiry,
    DEFAULT_HR_EXPIRY_SETTINGS,
  );

  return <ExpirySettingsPanel settings={settings} />;
}
