import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function HrLookupsPage() {
  redirect(await scopedPath("/hr/settings"));
}
