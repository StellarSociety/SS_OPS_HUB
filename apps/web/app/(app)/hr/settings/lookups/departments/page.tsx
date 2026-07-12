import { DepartmentsSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listDepartments } from "@/lib/hr/store";

export default async function HrDepartmentsSettingsPage() {
  const { supabase, venue } = await getHrPageContext();
  const departments = await listDepartments(supabase, venue.id);

  return <DepartmentsSection departments={departments} />;
}
