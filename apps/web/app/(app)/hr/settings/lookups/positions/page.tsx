import { PositionsSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listDepartments, listPositions } from "@/lib/hr/store";

export default async function HrPositionsSettingsPage() {
  const { supabase, venue } = await getHrPageContext();
  const [departments, positions] = await Promise.all([
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
  ]);

  return <PositionsSection positions={positions} departments={departments} />;
}
