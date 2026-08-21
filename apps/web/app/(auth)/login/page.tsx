import { LoginScreen } from "@/components/auth/login-screen";
import { fetchGroupBrandingState } from "@/lib/group/branding";

const NOTICES: Record<string, string> = {
  deactivated: "Your account has been deactivated.",
  auth_callback: "Sign-in link expired or invalid. Try again or contact an admin.",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const notice = error ? NOTICES[error] ?? null : null;
  const { logoUrl, faviconUrl } = await fetchGroupBrandingState();

  return (
    <LoginScreen notice={notice} logoUrl={logoUrl} faviconUrl={faviconUrl} />
  );
}
