"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AndroidInstallButton } from "@/components/pwa/android-install-button";
import { DesktopInstallPanel } from "@/components/pwa/desktop-install-panel";
import { IOSInstallInstructions } from "@/components/pwa/ios-install-instructions";
import {
  fallbackDevice,
  usePWAInstall,
} from "@/components/pwa/pwa-install-provider";
import { Button } from "@/components/ui/button";
import { PWA_APP_NAME, PWA_LOGO_SRC } from "@/lib/pwa/constants";
import {
  defaultPwaOpenPath,
  readStoredPwaReturnPath,
  storePwaReturnPath,
} from "@/lib/pwa/return-path";

type InstallAppPageProps = {
  nextPath?: string | null;
};

export function InstallAppPage({ nextPath = null }: InstallAppPageProps) {
  const router = useRouter();
  const { installed, standalone, device } = usePWAInstall();
  const resolved = fallbackDevice(device);

  useEffect(() => {
    storePwaReturnPath(nextPath);
  }, [nextPath]);

  function openApp() {
    router.push(defaultPwaOpenPath(nextPath ?? readStoredPwaReturnPath()));
  }

  const ready = device !== null;
  const showInstalled = ready && (installed || standalone);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#E9E3D6] px-5 py-12">
      <div className="w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PWA_LOGO_SRC}
          alt={PWA_APP_NAME}
          width={96}
          height={96}
          className="mx-auto size-24"
        />
        {showInstalled ? (
          <>
            <h1 className="mt-6 font-serif text-3xl text-[#3D421F]">
              {standalone ? "SS OPS HUB is installed" : "SS OPS HUB has been installed."}
            </h1>
            <p className="mt-3 text-base leading-6 text-[#3D421F]/75">
              You can open it from your Home Screen anytime.
            </p>
            <Button
              type="button"
              className="mt-8 h-12 w-full text-base"
              onClick={openApp}
            >
              Open SS OPS HUB
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-serif text-3xl text-[#3D421F]">
              Install SS OPS HUB
            </h1>
            <p className="mt-3 text-base leading-6 text-[#3D421F]/75">
              Add SS OPS HUB to your Home Screen for quick and easy access.
            </p>
            <div className="mt-8">
              {!ready ? (
                <div className="h-12 rounded-md bg-[#818a40]/20" aria-hidden />
              ) : resolved.isDesktop ? (
                <DesktopInstallPanel />
              ) : resolved.isIOS ? (
                resolved.needsSafari ? (
                  <p className="rounded-2xl bg-white/60 px-4 py-4 text-base leading-6 text-[#3D421F] ring-1 ring-[#3D421F]/10">
                    Open this page in Safari to install SS OPS HUB.
                  </p>
                ) : (
                  <IOSInstallInstructions />
                )
              ) : (
                <AndroidInstallButton />
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
