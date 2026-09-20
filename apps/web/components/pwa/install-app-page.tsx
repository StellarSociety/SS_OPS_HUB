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
import type { PWADeviceState } from "@/lib/pwa/device";
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
  reinstall?: boolean;
};

export function InstallAppPage({
  logoUrl = DEFAULT_GROUP_LOGO_URL,
  appName = DEFAULT_APP_NAME,
  nextPath = null,
  preview = null,
  reinstall = false,
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
  const showReinstall = reinstall || previewKind === "reinstall";
  const showInstalled =
    !showReinstall &&
    (previewKind === "installed" ||
      (previewKind === null && ready && (installed || standalone)));

  return (
    <main
      className={`flex h-dvh min-h-0 flex-col items-center overflow-hidden bg-black px-5 text-white pt-[max(3rem,env(safe-area-inset-top,0px))] ${DEV_PREVIEW ? "pb-24" : "pb-[max(3rem,env(safe-area-inset-bottom,0px))]"}`}
    >
      <div className="min-h-0 w-full max-w-sm flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <div className="flex min-h-full w-full flex-col items-center justify-safe-center py-4 pb-10 text-center">
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
        ) : showReinstall ? (
          <ReinstallInstructions
            appName={appName}
            ready={ready}
            resolved={resolved}
          />
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
      </div>
      {DEV_PREVIEW ? <InstallPreviewToolbar current={previewKind} /> : null}
    </main>
  );
}

function ReinstallInstructions({
  appName,
  ready,
  resolved,
}: {
  appName: string;
  ready: boolean;
  resolved: PWADeviceState;
}) {
  const deleteSteps = resolved.isAndroid
    ? [
        "Go to your Home Screen.",
        `Touch and hold the ${appName} icon, then remove or uninstall it.`,
        "Return to this page and install it again.",
      ]
    : resolved.isIOS
      ? [
          "Go to your Home Screen.",
          `Touch and hold the ${appName} icon.`,
          "Tap Remove App, then Delete Bookmark.",
          "Come back to this Safari page and Add to Home Screen again.",
        ]
      : [
          "On the phone, go to the Home Screen.",
          `Touch and hold the ${appName} icon and delete it.`,
          "Then scan the QR code and Add to Home Screen again.",
        ];

  return (
    <>
      <h1 className="mt-6 font-serif text-3xl text-white">
        Update {appName}
      </h1>
      <p className="mt-3 text-base leading-6 text-white/70">
        Delete the current Home Screen icon first, then install {appName} again
        from this page.
      </p>
      <p className="mt-8 text-left text-sm font-medium uppercase tracking-wide text-white/50">
        Delete the current app
      </p>
      <ol className="mt-3 space-y-3 text-left">
        {deleteSteps.map((step, index) => (
          <li
            key={step}
            className="flex gap-3 rounded-2xl bg-neutral-900 px-3 py-3 ring-1 ring-white/12"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-semibold text-white">
              {index + 1}
            </span>
            <p className="min-w-0 flex-1 pt-1 text-sm leading-5 text-white">
              {step}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-left text-sm font-medium uppercase tracking-wide text-white/50">
        Then install again
      </p>
      <div className="mt-3">
        {!ready ? (
          <div className="h-12 rounded-md bg-neutral-800" aria-hidden />
        ) : resolved.isDesktop ? (
          <DesktopInstallPanel appName={appName} />
        ) : resolved.isIOS ? (
          resolved.needsSafari ? (
            <p className="rounded-2xl bg-neutral-900 px-4 py-4 text-base leading-6 text-white ring-1 ring-white/15">
              Open this page in Safari, then Add {appName} to your Home Screen
              again.
            </p>
          ) : (
            <IOSInstallInstructions appName={appName} />
          )
        ) : (
          <AndroidInstallButton appName={appName} />
        )}
      </div>
    </>
  );
}
