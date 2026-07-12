import { NotificationSettingsPanel } from "@/components/hr/settings-panels";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_NOTIFICATION_SETTINGS,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";

export default async function HrNotificationSettingsPage() {
  const { supabase, venue } = await getHrPageContext();
  const settings = await getHrVenueSetting(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.notifications,
    DEFAULT_HR_NOTIFICATION_SETTINGS,
  );

  return <NotificationSettingsPanel settings={settings} />;
}
