import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function HrSettingsLegacyRedirectPage() {
  redirect(await scopedPath("/hr/settings/notifications/expiry"));
}
