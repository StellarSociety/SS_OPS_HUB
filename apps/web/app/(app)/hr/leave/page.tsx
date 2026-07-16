import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

/** Old sidebar URL — keep bookmarks working. */
export default async function LegacyLeaveRedirectPage() {
  redirect(await scopedPath("/hr/attendance/leave/balances"));
}
