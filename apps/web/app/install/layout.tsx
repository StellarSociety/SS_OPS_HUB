import type { Viewport } from "next";
import { MobileNoZoom } from "@/components/mobile/mobile-no-zoom";
import { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from "@/lib/pwa/constants";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: PWA_THEME_COLOR,
  colorScheme: "light",
};

export default function InstallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MobileNoZoom />
      <div style={{ backgroundColor: PWA_BACKGROUND_COLOR }}>{children}</div>
    </>
  );
}
