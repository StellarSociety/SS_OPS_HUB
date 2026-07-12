import { redirect } from "next/navigation";

export default function HrPositionsRedirect() {
  redirect("/hr/settings/lookups/positions");
}
