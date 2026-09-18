import { HiringShortlistClient } from "@/components/hr/hiring-shortlist-client";
import { listShortlistedApplications } from "@/lib/hr/hiring/store";
import { getHrPageContext } from "@/lib/hr/page-context";
import { createServiceClient } from "@/lib/supabase/service";

export default async function HiringShortlistPage() {
  const { venue } = await getHrPageContext();
  const applications = await listShortlistedApplications(
    createServiceClient(),
    venue.id,
  );
  return <HiringShortlistClient applications={applications} />;
}
