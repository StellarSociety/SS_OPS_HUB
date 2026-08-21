"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { usePWAInstall } from "@/components/pwa/pwa-install-provider";
import {
  PWA_BANNER_DISMISS_KEY,
  PWA_BANNER_DISMISS_MS,
  PWA_INSTALL_PATH,
} from "@/lib/pwa/constants";
import { isMobileAppPath } from "@/lib/mobile/app-path";
import { rememberCurrentMobilePath } from "@/lib/pwa/return-path";

const DISMISS_EVENT = "ss-ops-pwa-banner-dismiss";

function bannerIsDismissed(): boolean {
  try {
    const raw = localStorage.getItem(PWA_BANNER_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at < PWA_BANNER_DISMISS_MS;
  } catch {
    return false;
  }
}

function subscribeBannerDismiss(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DISMISS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DISMISS_EVENT, onStoreChange);
  };
}

export function InstallAppBanner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { installed, standalone, canPrompt, promptInstall } = usePWAInstall();
  const dismissed = useSyncExternalStore(
    subscribeBannerDismiss,
    bannerIsDismissed,
    () => true,
  );

  if (dismissed || standalone || installed) return null;
  if (!isMobileAppPath(pathname) || pathname === PWA_INSTALL_PATH) return null;

  const search = searchParams.toString();
  const next = `${pathname}${search ? `?${search}` : ""}`;
  const href = `${PWA_INSTALL_PATH}?next=${encodeURIComponent(next)}`;

  function dismiss() {
    try {
      localStorage.setItem(PWA_BANNER_DISMISS_KEY, String(Date.now()));
    } catch {
      // Ignore quota / private-mode failures.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  async function onInstall() {
    rememberCurrentMobilePath(pathname, search ? `?${search}` : "");
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        dismiss();
        return;
      }
      if (outcome === "dismissed") dismiss();
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#3D421F] px-3 py-2.5 text-white shadow-lg shadow-black/20">
        <p className="min-w-0 flex-1 text-sm leading-5">
          Install SS OPS HUB for easier access
        </p>
        {canPrompt ? (
          <button
            type="button"
            onClick={() => void onInstall()}
            className="shrink-0 rounded-full bg-[#818a40] px-3 py-1.5 text-sm font-medium"
          >
            Install
          </button>
        ) : (
          <Link
            href={href}
            onClick={() =>
              rememberCurrentMobilePath(pathname, search ? `?${search}` : "")
            }
            className="shrink-0 rounded-full bg-[#818a40] px-3 py-1.5 text-sm font-medium"
          >
            Install
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full p-1 text-white/70 hover:text-white"
          aria-label="Dismiss install banner"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
