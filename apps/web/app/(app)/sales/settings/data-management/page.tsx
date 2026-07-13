import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function SalesDataManagementPage() {
  redirect(await scopedPath("/sales/settings/data-management/daily-sales"));
}
