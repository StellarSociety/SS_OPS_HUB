import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";
import { HR_SETTINGS_EMAILS_CONNECTION_HREF } from "@/lib/hr/settings-nav";

export default async function HrEmailsSettingsPage() {
  redirect(await scopedPath(HR_SETTINGS_EMAILS_CONNECTION_HREF));
}
