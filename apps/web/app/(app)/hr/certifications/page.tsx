import { redirect } from "next/navigation";

/** Legacy path — Certifications now lives under Staff Compliance. */
export default function HrCertificationsRedirectPage() {
  redirect("/hr/assets/certifications");
}
