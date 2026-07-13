import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function HrDataManagementPage() {
  redirect(await scopedPath("/hr/settings/data-management/employees-details"));
}
