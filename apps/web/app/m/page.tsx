import { redirect } from "next/navigation";
import { getRenderUser } from "@/lib/auth/render-user";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import { mobileHomeHref } from "@/lib/mobile/home-venue";

/** App start (installed app opens here): signed in → straight to the welcome page. */
export default async function MobileAppIndexPage() {
  const user = await getRenderUser();
  if (!user) redirect(`${MOBILE_APP_BASE}/login`);
  redirect(await mobileHomeHref(user.id));
}
