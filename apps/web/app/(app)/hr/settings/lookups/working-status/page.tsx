import { WorkingStatusSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listWorkingStatuses } from "@/lib/hr/store";

export default async function HrWorkingStatusSettingsPage() {
  const { supabase } = await getHrPageContext();
  const statuses = await listWorkingStatuses(supabase);

  return <WorkingStatusSection statuses={statuses} />;
}
