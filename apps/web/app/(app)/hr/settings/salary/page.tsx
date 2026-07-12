import { SalaryDefaultsPanel } from "@/components/hr/settings-panels";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import { DEFAULT_HR_SALARY_DEFAULTS, HR_SETTINGS_KEYS } from "@/lib/hr/types";

export default async function HrSalarySettingsPage() {
  const { supabase, venue } = await getHrPageContext();
  const settings = await getHrVenueSetting(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.salaryDefaults,
    DEFAULT_HR_SALARY_DEFAULTS,
  );

  return <SalaryDefaultsPanel settings={settings} />;
}
