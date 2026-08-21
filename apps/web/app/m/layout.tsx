import type { Viewport } from "next";
import { Suspense } from "react";
import { MobileNoZoom } from "@/components/mobile/mobile-no-zoom";
import { InstallAppBanner } from "@/components/pwa/install-app-banner";
import { MOBILE_APP_VIEWPORT } from "@/lib/mobile/viewport";

export const viewport: Viewport = MOBILE_APP_VIEWPORT;

export default function MobileAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MobileNoZoom />
      {children}
      <Suspense fallback={null}>
        <InstallAppBanner />
      </Suspense>
    </>
  );
}
