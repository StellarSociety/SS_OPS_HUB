import { redirect } from "next/navigation";

export default function HrNationalitiesRedirect() {
  redirect("/hr/settings/lookups/nationalities");
}
