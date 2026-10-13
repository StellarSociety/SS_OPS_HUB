import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/login-screen";
import { getRenderUser } from "@/lib/auth/render-user";
import { mobileHomeHref } from "@/lib/mobile/home-venue";
import { fetchGroupBrandingState } from "@/lib/group/branding";
import { MOBILE_APP_BASE, safeMobileAppPath } from "@/lib/mobile/app-path";

const NOTICES: Record<string, string> = {
  deactivated: "Your account has been deactivated.",
  auth_callback: "Sign-in link expired or invalid. Try again or contact an admin.",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function MobileLoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;
  const notice = error ? NOTICES[error] ?? null : null;

  // Already signed in (e.g. the installed app reopened): skip the login screen.
  if (!error) {
    const user = await getRenderUser();
    if (user) redirect(safeMobileAppPath(next) ?? (await mobileHomeHref(user.id)));
  }
  const { logoUrl, faviconUrl } = await fetchGroupBrandingState();

  return (
    <LoginScreen
      notice={notice}
      logoUrl={logoUrl}
      faviconUrl={faviconUrl}
      mobileApp
      // After sign-in, /m picks the last or only venue's welcome page.
      nextPath={safeMobileAppPath(next) ?? `${MOBILE_APP_BASE}`}
    />
  );
}
