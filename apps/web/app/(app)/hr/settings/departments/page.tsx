import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function HrDepartmentsRedirect() {
  redirect(await scopedPath("/hr/settings/lookups/departments"));
}
