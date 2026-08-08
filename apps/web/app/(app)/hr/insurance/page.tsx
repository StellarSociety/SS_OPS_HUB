import { redirect } from "next/navigation";

/** Legacy path — Insurance now lives under Staff Compliance. */
export default function HrInsuranceRedirectPage() {
  redirect("/hr/assets/insurance/employees");
}
