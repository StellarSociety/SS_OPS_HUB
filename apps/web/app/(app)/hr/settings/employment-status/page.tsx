import { redirect } from "next/navigation";

export default function HrEmploymentStatusRedirect() {
  redirect("/hr/settings/lookups/employment-status");
}
