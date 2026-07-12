import { GenderSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listGenders } from "@/lib/hr/store";

export default async function HrGenderSettingsPage() {
  const { supabase } = await getHrPageContext();
  const genders = await listGenders(supabase);

  return <GenderSection genders={genders} />;
}
