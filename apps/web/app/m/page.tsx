import { redirect } from "next/navigation";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";

export default function MobileAppIndexPage() {
  redirect(`${MOBILE_APP_BASE}/login`);
}
