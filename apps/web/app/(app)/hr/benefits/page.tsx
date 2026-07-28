import { redirect } from "next/navigation";
import { HR_BENEFITS_GRATUITY_HREF } from "@/lib/hr/settings-nav";

export default function HrBenefitsPage() {
  redirect(HR_BENEFITS_GRATUITY_HREF);
}
