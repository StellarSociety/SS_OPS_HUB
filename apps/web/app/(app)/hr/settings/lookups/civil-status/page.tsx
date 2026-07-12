import { CivilStatusSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listCivilStatuses } from "@/lib/hr/store";

export default async function HrCivilStatusSettingsPage() {
  const { supabase } = await getHrPageContext();
  const civilStatuses = await listCivilStatuses(supabase);

  return <CivilStatusSection civilStatuses={civilStatuses} />;
}
