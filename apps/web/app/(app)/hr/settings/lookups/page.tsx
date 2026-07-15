import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";
import { HR_SETTINGS_DEFAULT_HREF } from "@/lib/hr/settings-nav";

export default async function HrLookupsIndexPage() {
  redirect(await scopedPath(HR_SETTINGS_DEFAULT_HREF));
}
