"use client";

import { QrFrame } from "@/components/guests-intel/qr-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

export function CollectSharePanel({
  formUrl,
  formQrSvg,
  publicFormEnabled,
}: {
  formUrl: string;
  formQrSvg: string;
  publicFormEnabled: boolean;
}) {
  return (
    <Card className="mx-auto w-full max-w-xl space-y-4 p-6">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Share with guests</h2>
        <p className="mt-1 text-sm text-black/55">
          Print or display this QR, or copy the link, so guests can fill the form
          themselves.
        </p>
      </div>

      {publicFormEnabled && formQrSvg ? (
        <>
          <QrFrame
            svg={formQrSvg}
            label="Guest form QR code"
            defaultSize="l"
          />
          <p className="break-all text-center text-xs text-black/45">{formUrl}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(formUrl);
                  toast.saved("Link copied.");
                } catch {
                  toast.error("Could not copy the link.");
                }
              }}
            >
              Copy link
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-black/55">
          The public guest form is turned off. Enable it in Settings to share a QR
          and link.
        </p>
      )}
    </Card>
  );
}
