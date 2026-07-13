import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function HrPositionsRedirect() {
  redirect(await scopedPath("/hr/settings/lookups/positions"));
}
