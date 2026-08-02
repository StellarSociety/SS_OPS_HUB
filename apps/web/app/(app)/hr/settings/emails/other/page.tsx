import { redirect } from "next/navigation";
import { HR_SETTINGS_EMAILS_OTHER_WORK_ANNIVERSARY_HREF } from "@/lib/hr/settings-nav";

export default function HrEmailsOtherTemplatesPage() {
  redirect(HR_SETTINGS_EMAILS_OTHER_WORK_ANNIVERSARY_HREF);
}
