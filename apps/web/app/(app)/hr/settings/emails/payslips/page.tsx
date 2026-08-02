import { redirect } from "next/navigation";
import { HR_SETTINGS_EMAILS_PAYSLIPS_HREF } from "@/lib/hr/settings-nav";
import { scopedPath } from "@/lib/venue/active-venue";

/** Legacy path — now under Emails → PAY email → Payslips. */
export default async function HrEmailsPayslipsSettingsRedirectPage() {
  redirect(await scopedPath(HR_SETTINGS_EMAILS_PAYSLIPS_HREF));
}
