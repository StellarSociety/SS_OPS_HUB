import { LoginForm } from "@/components/auth/login-form";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12">
      <LoginForm notice={notice} />
    </div>
  );
}
