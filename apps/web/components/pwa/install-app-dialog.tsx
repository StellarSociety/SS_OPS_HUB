"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { GroupLogo } from "@/components/brand/group-logo";
import { DesktopInstallPanel } from "@/components/pwa/desktop-install-panel";
import { DEFAULT_APP_NAME, DEFAULT_GROUP_LOGO_URL } from "@/lib/group/branding";

type InstallAppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logoUrl?: string;
  appName?: string;
};

export function InstallAppDialog({
  open,
  onOpenChange,
  logoUrl = DEFAULT_GROUP_LOGO_URL,
  appName = DEFAULT_APP_NAME,
}: InstallAppDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-app-dialog-title"
        className="relative w-full max-w-sm rounded-3xl bg-black px-5 py-10 text-white shadow-xl ring-1 ring-white/15"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <GroupLogo
            src={logoUrl}
            eager
            className="mx-auto h-auto w-[260px] max-w-full"
          />
          <h2
            id="install-app-dialog-title"
            className="mt-6 font-serif text-3xl text-white"
          >
            Install {appName}
          </h2>
          <p className="mt-3 text-base leading-6 text-white/70">
            Add {appName} to your Home Screen for quick and easy access.
            <br />
            Scan the QR Code to install {appName} on your phone
          </p>
          <div className="mt-8">
            <DesktopInstallPanel appName={appName} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
