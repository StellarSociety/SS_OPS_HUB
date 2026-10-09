import { redirect } from "next/navigation";
import { getHrPageContext } from "@/lib/hr/page-context";
import { scopedHrefForVenue } from "@/lib/venue/scope-routing";

/** SS OPS HUB T&C's moved under Policies Templates. */
export default async function HrHubTermsMovedPage() {
  const { venue } = await getHrPageContext();
  redirect(scopedHrefForVenue(venue, "/hr/communications/policies/hub-terms"));
}
