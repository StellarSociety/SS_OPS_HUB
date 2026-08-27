"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QrFrame } from "@/components/guests-intel/qr-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  rotateLiveDisplayLink,
  setLiveDisplayEnabled,
} from "@/lib/actions/live-display";
import type { LiveDisplaySettings } from "@/lib/sentiment/live-display/types";

export function LiveDisplaySharePanel({
  settings,
  displayUrl,
  displayQrSvg,
  canEdit,
}: {
  settings: LiveDisplaySettings;
  displayUrl: string;
  displayQrSvg: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings.enabled);

  function saveEnabled(next: boolean) {
    if (!canEdit) return;
    setEnabled(next);
    startTransition(async () => {
      const result = await setLiveDisplayEnabled(next);
      if (!result.ok) {
        setEnabled(!next);
        toast.error(result.error);
        return;
      }
      toast.saved(next ? "Live display is on." : "Live display is off.");
      router.refresh();
    });
  }

  return (
    <Card className="mx-auto w-full max-w-xl space-y-4 p-6">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Shareable link</h2>
        <p className="mt-1 text-sm text-black/55">
          Open this URL on the restaurant iPad. No sign-in is required. Add it
          to the Home Screen for a full-screen display.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-[#3D421F]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit || pending}
          onChange={(event) => saveEnabled(event.target.checked)}
        />
        Display is live
      </label>

      {enabled && displayQrSvg ? (
        <>
          <QrFrame
            svg={displayQrSvg}
            label="Live display QR"
            defaultSize="m"
            showSizeControls={false}
          />
          <p className="break-all text-center font-mono text-sm text-[#3D421F]">
            {displayUrl}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(displayUrl);
                  toast.saved("Link copied.");
                } catch {
                  toast.error("Could not copy the link.");
                }
              }}
            >
              Copy link
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                window.open(displayUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Open display
            </Button>
            {canEdit ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await rotateLiveDisplayLink();
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.saved(
                      "New link created. The previous iPad URL will stop working.",
                    );
                    router.refresh();
                  });
                }}
              >
                New short code
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-black/55">
          Turn the display on to share a link and QR for the restaurant iPad.
        </p>
      )}

      {!canEdit ? (
        <p className="text-sm text-black/45">
          You can view this page, but changing the link needs Live Display
          editor access.
        </p>
      ) : null}
    </Card>
  );
}
