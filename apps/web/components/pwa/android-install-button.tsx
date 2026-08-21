"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/components/pwa/pwa-install-provider";

export function AndroidInstallButton() {
  const { canPrompt, dismissedThisSession, promptInstall } = usePWAInstall();
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleClick() {
    if (!canPrompt) return;
    setBusy(true);
    await promptInstall();
    setBusy(false);
  }

  if (dismissedThisSession && !canPrompt) {
    return (
      <p className="text-sm leading-6 text-[#3D421F]/70">
        You can install SS OPS HUB later from your browser menu if you change
        your mind.
      </p>
    );
  }

  const showMenuFallback = waited && !canPrompt;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="h-12 w-full text-base"
        disabled={!canPrompt || busy}
        onClick={() => void handleClick()}
      >
        {busy ? "Installing…" : "Install SS OPS HUB"}
      </Button>
      {showMenuFallback ? (
        <div className="rounded-2xl bg-white/55 px-4 py-3 text-left text-sm leading-6 text-[#3D421F]/80 ring-1 ring-[#3D421F]/8">
          <p className="font-medium text-[#3D421F]">
            Install from the browser menu
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Tap the menu in Chrome (three dots).</li>
            <li>Tap “Install app” or “Add to Home screen”.</li>
            <li>Confirm to add SS OPS HUB.</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
