"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AndroidInstallButton } from "@/components/pwa/android-install-button";
import { DesktopInstallPanel } from "@/components/pwa/desktop-install-panel";
import { IOSInstallInstructions } from "@/components/pwa/ios-install-instructions";
import { InstallPreviewToolbar } from "@/components/pwa/install-preview-toolbar";
import {
  fallbackDevice,
  usePWAInstall,
} from "@/components/pwa/pwa-install-provider";
import { GroupLogo } from "@/components/brand/group-logo";
import { Button } from "@/components/ui/button";
import { DEFAULT_APP_NAME, DEFAULT_GROUP_LOGO_URL } from "@/lib/group/branding";
import {
  deviceForInstallPreview,
  type InstallPreviewKind,
} from "@/lib/pwa/install-preview";
import {
  defaultPwaOpenPath,
  readStoredPwaReturnPath,
  storePwaReturnPath,
} from "@/lib/pwa/return-path";

const DEV_PREVIEW = process.env.NODE_ENV === "development";

type InstallAppPageProps = {
  logoUrl?: string;
  appName?: string;
  nextPath?: string | null;
  preview?: InstallPreviewKind | null;
};

export function InstallAppPage({
  logoUrl = DEFAULT_GROUP_LOGO_URL,
  appName = DEFAULT_APP_NAME,
  nextPath = null,
  preview = null,
}: InstallAppPageProps) {
  const router = useRouter();
  const { installed, standalone, device } = usePWAInstall();
  const previewKind = DEV_PREVIEW ? preview : null;
  const resolved = previewKind
    ? deviceForInstallPreview(previewKind)
    : fallbackDevice(device);

  useEffect(() => {
    storePwaReturnPath(nextPath);
  }, [nextPath]);

  function openApp() {
    router.push(defaultPwaOpenPath(nextPath ?? readStoredPwaReturnPath()));
  }

  const ready = previewKind !== null || device !== null;
  const showInstalled =
    previewKind === "installed" ||
    (previewKind === null && ready && (installed || standalone));

  return (
    <main
      className={`flex min-h-dvh flex-col items-center justify-center bg-black px-5 py-12 text-white ${DEV_PREVIEW ? "pb-24" : ""}`}
    >
      <div className="w-full max-w-sm text-center">
        <GroupLogo
          src={logoUrl}
          eager
          className="mx-auto h-auto w-[260px] max-w-full"
        />
        {showInstalled ? (
          <>
            <h1 className="mt-6 font-serif text-3xl text-white">
              {standalone ? `${appName} is installed` : `${appName} has been installed.`}
            </h1>
            <p className="mt-3 text-base leading-6 text-white/70">
              You can open it from your Home Screen anytime.
            </p>
            <Button
              type="button"
              className="mt-8 h-12 w-full bg-neutral-700 text-base text-white hover:bg-neutral-600 hover:opacity-100"
              onClick={openApp}
            >
              Open {appName}
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-serif text-3xl text-white">
              Install {appName}
            </h1>
            <p className="mt-3 text-base leading-6 text-white/70">
              Add {appName} to your Home Screen for quick and easy access.
              {ready && resolved.isDesktop ? (
                <>
                  <br />
                  Scan the QR Code to install {appName} on your phone
                </>
              ) : null}
            </p>
            <div className="mt-8">
              {!ready ? (
                <div className="h-12 rounded-md bg-neutral-800" aria-hidden />
              ) : resolved.isDesktop ? (
                <DesktopInstallPanel appName={appName} />
              ) : resolved.isIOS ? (
                resolved.needsSafari ? (
                  <p className="rounded-2xl bg-neutral-900 px-4 py-4 text-base leading-6 text-white ring-1 ring-white/15">
                    Open this page in Safari to install {appName}.
                  </p>
                ) : (
                  <IOSInstallInstructions appName={appName} />
                )
              ) : (
                <AndroidInstallButton appName={appName} />
              )}
            </div>
          </>
        )}
      </div>
      {DEV_PREVIEW ? <InstallPreviewToolbar current={previewKind} /> : null}
    </main>
  );
}
