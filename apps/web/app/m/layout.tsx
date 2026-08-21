import type { Viewport } from "next";
import { Suspense } from "react";
import { MobileNoZoom } from "@/components/mobile/mobile-no-zoom";
import { MobileAppShell } from "@/components/mobile/mobile-app-shell";
import { InstallAppBanner } from "@/components/pwa/install-app-banner";
import { fetchGroupBrandingState } from "@/lib/group/branding";
import { MOBILE_APP_VIEWPORT } from "@/lib/mobile/viewport";

export const viewport: Viewport = MOBILE_APP_VIEWPORT;

export default async function MobileAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appName } = await fetchGroupBrandingState();

  return (
    <>
      <MobileNoZoom />
      <MobileAppShell>{children}</MobileAppShell>
      <Suspense fallback={null}>
        <InstallAppBanner appName={appName} />
      </Suspense>
    </>
  );
}
