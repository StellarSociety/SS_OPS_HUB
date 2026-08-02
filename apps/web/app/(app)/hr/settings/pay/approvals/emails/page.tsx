import { redirect } from "next/navigation";
import { HR_SETTINGS_EMAILS_PAYROLL_HREF } from "@/lib/hr/settings-nav";
import { scopedPath } from "@/lib/venue/active-venue";

/** Legacy path — Emails Config moved to Settings → Emails → PAY email → Payroll. */
export default async function HrPayrollApprovalsEmailsSettingsRedirectPage() {
  redirect(await scopedPath(HR_SETTINGS_EMAILS_PAYROLL_HREF));
}
