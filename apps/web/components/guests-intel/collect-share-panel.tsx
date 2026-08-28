"use client";

import { GuestFormShareCard } from "@/components/guests-intel/guest-form-share-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

export function CollectSharePanel({
  formUrl,
  formQrPngDataUrl,
  publicFormEnabled,
  venueName,
  venueLogoUrl,
  venueSlug,
  primaryColor,
  secondaryColor,
}: {
  formUrl: string;
  formQrPngDataUrl: string;
  publicFormEnabled: boolean;
  venueName: string;
  venueLogoUrl: string | null;
  venueSlug: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  return (
    <Card className="mx-auto w-full max-w-md space-y-4 p-6">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Share with guests</h2>
        <p className="mt-1 text-sm text-black/55">
          Open this on your phone and hold it up. The guest scans with their
          camera and fills their own details.
        </p>
      </div>

      {publicFormEnabled && formQrPngDataUrl ? (
        <>
          <GuestFormShareCard
            formUrl={formUrl}
            qrPngDataUrl={formQrPngDataUrl}
            venueName={venueName}
            venueLogoUrl={venueLogoUrl}
            venueSlug={venueSlug}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
          />
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              className="text-xs text-black/55"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(formUrl);
                  toast.saved("Link copied.");
                } catch {
                  toast.error("Could not copy the link.");
                }
              }}
            >
              Copy link instead
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
