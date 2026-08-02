import { redirect } from "next/navigation";
import { HR_SETTINGS_EMAILS_PAYROLL_HREF } from "@/lib/hr/settings-nav";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function HrEmailsPaySettingsIndexPage() {
  redirect(await scopedPath(HR_SETTINGS_EMAILS_PAYROLL_HREF));
}
