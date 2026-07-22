import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function AttendanceModuleIndexPage() {
  redirect(await scopedPath("/hr/attendance/validation"));
}
