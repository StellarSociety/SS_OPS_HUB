import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

/** Moved to Venue Settings → Drive config. */
export default async function HrDataManagementDriveSetupPage() {
  redirect(await scopedPath("/settings/drive-config"));
}
