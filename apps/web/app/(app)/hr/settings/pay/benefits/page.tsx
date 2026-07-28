import { redirect } from "next/navigation";
import { HR_SETTINGS_PAY_BENEFITS_GRATUITY_HREF } from "@/lib/hr/settings-nav";

export default function HrPayBenefitsIndexPage() {
  redirect(HR_SETTINGS_PAY_BENEFITS_GRATUITY_HREF);
}
