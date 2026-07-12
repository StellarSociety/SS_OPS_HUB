import { redirect } from "next/navigation";

export default function HrDepartmentsRedirect() {
  redirect("/hr/settings/lookups/departments");
}
