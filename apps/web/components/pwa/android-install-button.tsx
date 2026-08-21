"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/components/pwa/pwa-install-provider";
import { DEFAULT_APP_NAME } from "@/lib/group/branding";

export function AndroidInstallButton({
  appName = DEFAULT_APP_NAME,
}: {
  appName?: string;
}) {
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
      <p className="text-sm leading-6 text-white/60">
        You can install {appName} later from your browser menu if you change
        your mind.
      </p>
    );
  }

  const showMenuFallback = waited && !canPrompt;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="h-12 w-full bg-neutral-700 text-base text-white hover:bg-neutral-600 hover:opacity-100"
        disabled={!canPrompt || busy}
        onClick={() => void handleClick()}
      >
        {busy ? "Installing…" : `Install ${appName}`}
      </Button>
      {showMenuFallback ? (
        <div className="rounded-2xl bg-neutral-900 px-4 py-3 text-left text-sm leading-6 text-white/70 ring-1 ring-white/12">
          <p className="font-medium text-white">
            Install from the browser menu
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Tap the menu in Chrome (three dots).</li>
            <li>Tap “Install app” or “Add to Home screen”.</li>
            <li>Confirm to add {appName}.</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
