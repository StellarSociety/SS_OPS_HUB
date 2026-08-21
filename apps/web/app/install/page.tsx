import { InstallAppPage } from "@/components/pwa/install-app-page";
import { fetchGroupBrandingState } from "@/lib/group/branding";
import { parseInstallPreview } from "@/lib/pwa/install-preview";
import { safePwaReturnPath } from "@/lib/pwa/return-path";
import type { Metadata } from "next";

type PageProps = {
  searchParams: Promise<{ next?: string; preview?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const { appName } = await fetchGroupBrandingState();
  return {
    title: `Install ${appName}`,
    description: `Add ${appName} to your Home Screen for quick and easy access.`,
    applicationName: appName,
    appleWebApp: {
      capable: true,
      title: appName,
      statusBarStyle: "black-translucent",
    },
    robots: { index: false, follow: false },
  };
}

export default async function InstallPage({ searchParams }: PageProps) {
  const { next, preview } = await searchParams;
  const { logoUrl, appName } = await fetchGroupBrandingState();
  return (
    <InstallAppPage
      logoUrl={logoUrl}
      appName={appName}
      nextPath={safePwaReturnPath(next)}
      preview={parseInstallPreview(preview)}
    />
  );
}
