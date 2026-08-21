import { InstallAppPage } from "@/components/pwa/install-app-page";
import { safePwaReturnPath } from "@/lib/pwa/return-path";
import { PWA_APP_NAME } from "@/lib/pwa/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `Install ${PWA_APP_NAME}`,
  description: "Add SS OPS HUB to your Home Screen for quick and easy access.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function InstallPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  return <InstallAppPage nextPath={safePwaReturnPath(next)} />;
}
