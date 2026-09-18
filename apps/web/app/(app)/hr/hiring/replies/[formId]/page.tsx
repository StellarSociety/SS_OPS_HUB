import { HiringRepliesClient } from "@/components/hr/hiring-replies-client";
import { canEditHiring } from "@/lib/hr/permissions";
import {
  getHiringForm,
  listHiringApplicationsForForm,
  listHiringFormBlocks,
  listHiringForms,
} from "@/lib/hr/hiring/store";
import { getHrPageContext } from "@/lib/hr/page-context";
import { createServiceClient } from "@/lib/supabase/service";

export default async function HiringRepliesFormPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const { venue, permissions } = await getHrPageContext();
  const service = createServiceClient();
  const [forms, selectedForm] = await Promise.all([
    listHiringForms(service, venue.id),
    getHiringForm(service, venue.id, formId),
  ]);
  const [blocks, applications] = selectedForm
    ? await Promise.all([
        listHiringFormBlocks(service, selectedForm.id),
        listHiringApplicationsForForm(service, venue.id, selectedForm.id),
      ])
    : [[], []];

  return (
    <HiringRepliesClient
      forms={forms}
      selectedForm={selectedForm}
      blocks={blocks}
      applications={applications}
      canEdit={canEditHiring(permissions, venue.id)}
    />
  );
}
