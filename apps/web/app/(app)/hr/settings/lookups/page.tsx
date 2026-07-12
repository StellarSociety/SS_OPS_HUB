import { redirect } from "next/navigation";

export default function HrLookupsIndexPage() {
  redirect("/hr/settings/lookups/departments");
}
