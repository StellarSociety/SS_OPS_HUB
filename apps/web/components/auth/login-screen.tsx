import { VenueFavicon } from "@/components/brand/venue-favicon";
import { LoginForm } from "@/components/auth/login-form";
import { cn } from "@/lib/utils";

type LoginScreenProps = {
  notice?: string | null;
  logoUrl: string;
  faviconUrl?: string | null;
  fill?: boolean;
  preview?: boolean;
  onAuthenticated?: () => void;
  nextPath?: string | null;
  mobileApp?: boolean;
};

export function LoginScreen({
  notice,
  logoUrl,
  faviconUrl = null,
  fill = false,
  preview = false,
  onAuthenticated,
  nextPath = null,
  mobileApp = false,
}: LoginScreenProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden bg-black px-4",
        fill || mobileApp ? "py-8" : "py-12",
        fill ? "h-full min-h-0" : mobileApp ? "h-dvh" : "min-h-dvh",
      )}
    >
      {preview ? null : <VenueFavicon url={faviconUrl} />}
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
