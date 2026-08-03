import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

/** Moved to Venue Settings → Email config. */
export default async function HrEmailsConnectionSettingsPage() {
  redirect(await scopedPath("/settings/email-config"));
}
