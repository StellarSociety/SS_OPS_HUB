import { LoginForm } from "@/components/auth/login-form";
import { cn } from "@/lib/utils";

type LoginScreenProps = {
  notice?: string | null;
  logoUrl: string;
  fill?: boolean;
  preview?: boolean;
  onAuthenticated?: () => void;
  nextPath?: string | null;
  mobileApp?: boolean;
};

export function LoginScreen({
  notice,
  logoUrl,
  fill = false,
  preview = false,
  onAuthenticated,
  nextPath = null,
  mobileApp = false,
}: LoginScreenProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-black px-4 py-12",
        fill ? "h-full min-h-full" : "min-h-dvh",
      )}
    >
      <LoginForm
        notice={notice}
        logoUrl={logoUrl}
        preview={preview}
        onAuthenticated={onAuthenticated}
        nextPath={nextPath}
        mobileApp={mobileApp}
      />
    </div>
  );
}
