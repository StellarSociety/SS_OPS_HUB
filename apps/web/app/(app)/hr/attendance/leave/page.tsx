import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function LeaveModuleIndexPage() {
  redirect(await scopedPath("/hr/attendance/leave/balances"));
}
