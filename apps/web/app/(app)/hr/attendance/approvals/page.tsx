import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

/** Old URL — keep bookmarks working. */
export default async function AttendanceApprovalsRedirectPage() {
  redirect(await scopedPath("/hr/attendance/validation"));
}
