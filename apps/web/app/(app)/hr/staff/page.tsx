import { redirect } from "next/navigation";
import { getHrPageContext } from "@/lib/hr/page-context";
import { scopedHrefForVenue } from "@/lib/venue/scope-routing";

export default async function StaffDirectoryPage() {
  const { venue } = await getHrPageContext();
  redirect(scopedHrefForVenue(venue, "/hr/staff/entry"));
}
