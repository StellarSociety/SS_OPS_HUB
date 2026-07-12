import { NationalitiesSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listNationalities } from "@/lib/hr/store";

export default async function HrNationalitiesSettingsPage() {
  const { supabase } = await getHrPageContext();
  const nationalities = await listNationalities(supabase);

  return <NationalitiesSection nationalities={nationalities} />;
}
