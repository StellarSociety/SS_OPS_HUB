import { LoginScreen } from "@/components/auth/login-screen";
import { fetchGroupLogoState } from "@/lib/group/branding";
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
  const { logoUrl } = await fetchGroupLogoState();

  return (
    <LoginScreen
      notice={notice}
      logoUrl={logoUrl}
      mobileApp
      nextPath={safeMobileAppPath(next) ?? `${MOBILE_APP_BASE}/select-venue`}
    />
  );
}
