import type { Metadata, Viewport } from "next";
import { DM_Sans, Google_Sans, Inter, Playfair_Display } from "next/font/google";
import { PWAInstallProvider } from "@/components/pwa/pwa-install-provider";
import { MotionProvider } from "@/components/providers/motion-provider";
import { handwritten } from "@/lib/fonts";
import {
  DEFAULT_GROUP_FAVICON_URL,
  fetchGroupBrandingState,
} from "@/lib/group/branding";
import {
  PWA_APPLE_TOUCH_ICON,
  PWA_ICON_192,
  PWA_ICON_512,
  PWA_THEME_COLOR,
} from "@/lib/pwa/constants";
import { publicAppUrl } from "@/lib/public-app-url";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const { appName } = await fetchGroupBrandingState();
  return {
    metadataBase: new URL(publicAppUrl()),
    title: "Stellar Society — Operational Hub",
    description: "Internal operations hub for Stellar Society venues.",
    applicationName: appName,
    appleWebApp: {
      capable: true,
      title: appName,
      statusBarStyle: "black-translucent",
    },
    icons: {
      apple: [{ url: PWA_APPLE_TOUCH_ICON, sizes: "180x180", type: "image/png" }],
      icon: [
        { url: DEFAULT_GROUP_FAVICON_URL, type: "image/webp" },
        { url: PWA_ICON_192, sizes: "192x192", type: "image/png" },
        { url: PWA_ICON_512, sizes: "512x512", type: "image/png" },
      ],
    },
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
  };
}

export const viewport: Viewport = {
  themeColor: PWA_THEME_COLOR,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${dmSans.variable} ${googleSans.variable} ${handwritten.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MotionProvider>
          <PWAInstallProvider>{children}</PWAInstallProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
