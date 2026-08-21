import type { Viewport } from "next";
import { MobileNoZoom } from "@/components/mobile/mobile-no-zoom";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function InstallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MobileNoZoom />
      <div className="bg-black">{children}</div>
    </>
  );
}
