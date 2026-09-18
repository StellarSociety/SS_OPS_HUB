import { redirect } from "next/navigation";
import { HiringRepliesClient } from "@/components/hr/hiring-replies-client";
import { canEditHiring } from "@/lib/hr/permissions";
import { listHiringForms } from "@/lib/hr/hiring/store";
import { getHrPageContext } from "@/lib/hr/page-context";
import { createServiceClient } from "@/lib/supabase/service";
import { scopedHrefForVenue } from "@/lib/venue/scope-routing";

export default async function HiringRepliesIndexPage() {
  const { venue, permissions } = await getHrPageContext();
  const forms = await listHiringForms(createServiceClient(), venue.id);
  if (forms[0]) {
    redirect(scopedHrefForVenue(venue, `/hr/hiring/replies/${forms[0].id}`));
  }

  return (
    <HiringRepliesClient
      forms={[]}
      selectedForm={null}
      blocks={[]}
      applications={[]}
      notifyCandidates={[]}
      canEdit={canEditHiring(permissions, venue.id)}
    />
  );
}
