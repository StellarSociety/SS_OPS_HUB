import { redirect } from "next/navigation";
import { HR_SETTINGS_EMAILS_PAYROLL_HREF } from "@/lib/hr/settings-nav";
import { scopedPath } from "@/lib/venue/active-venue";

/** Legacy path — now under Emails → PAY email → Payroll. */
export default async function HrEmailsPayrollSettingsRedirectPage() {
  redirect(await scopedPath(HR_SETTINGS_EMAILS_PAYROLL_HREF));
}
