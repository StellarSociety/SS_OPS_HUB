import { HiringFormsList } from "@/components/hr/hiring-forms-list";
import { canEditHiring } from "@/lib/hr/permissions";
import { listHiringForms } from "@/lib/hr/hiring/store";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listDepartments, listPositions } from "@/lib/hr/store";
import { createServiceClient } from "@/lib/supabase/service";

export default async function HiringFormsPage() {
  const { venue, permissions } = await getHrPageContext();
  const service = createServiceClient();
  const [forms, departments, positions] = await Promise.all([
    listHiringForms(service, venue.id),
    listDepartments(service, venue.id),
    listPositions(service, venue.id),
  ]);

  return (
    <HiringFormsList
      forms={forms}
      departments={departments}
      positions={positions}
      canEdit={canEditHiring(permissions, venue.id)}
    />
  );
}
