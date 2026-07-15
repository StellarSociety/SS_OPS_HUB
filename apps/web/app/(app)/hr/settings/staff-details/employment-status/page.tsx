import { EmploymentStatusSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listEmploymentStatuses } from "@/lib/hr/store";

export default async function HrEmploymentStatusSettingsPage() {
  const { supabase } = await getHrPageContext();
  const statuses = await listEmploymentStatuses(supabase);

  return <EmploymentStatusSection statuses={statuses} />;
}
