import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function HrLookupsIndexPage() {
  redirect(await scopedPath("/hr/settings/lookups/departments"));
}
