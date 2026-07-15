import { InsuranceCategoriesSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listInsuranceCategories } from "@/lib/hr/store";

export default async function HrInsuranceCategoriesSettingsPage() {
  const { supabase } = await getHrPageContext();
  const categories = await listInsuranceCategories(supabase);

  return <InsuranceCategoriesSection categories={categories} />;
}
