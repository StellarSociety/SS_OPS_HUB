"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  downloadBlob,
  guestFormShareFilename,
  renderGuestFormShareCard,
  shareImageFile,
} from "@/lib/guests-intel/share-card";

export function GuestFormShareCard({
  formUrl,
  qrPngDataUrl,
  venueName,
  venueLogoUrl,
  venueSlug,
  primaryColor,
  secondaryColor,
}: {
  formUrl: string;
  qrPngDataUrl: string;
  venueName: string;
  venueLogoUrl: string | null;
  venueSlug: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  const titleId = useId();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [holdingUp, setHoldingUp] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const filename = guestFormShareFilename(venueSlug);

  useEffect(() => {
    try {
      const probe = new File([new Uint8Array([1])], "probe.png", {
        type: "image/png",
      });
      setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] })));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setImageUrl(null);
    setImageBlob(null);
    setError(null);

    void (async () => {
      try {
        const blob = await renderGuestFormShareCard({
          qrDataUrl: qrPngDataUrl,
          formUrl,
          venueName,
          venueLogoUrl,
          primaryColor,
          secondaryColor,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }
        setImageBlob(blob);
        setImageUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setError("Could not build the share image.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    formUrl,
    primaryColor,
    qrPngDataUrl,
    secondaryColor,
    venueLogoUrl,
    venueName,
  ]);

  useEffect(() => {
    if (!holdingUp) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setHoldingUp(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, holdingUp]);

  async function onShare() {
    if (!imageBlob) return;
    setBusy("share");
    try {
      const result = await shareImageFile({
        blob: imageBlob,
        filename,
        title: `${venueName} guest form`,
        text: "Scan this to add your details.",
      });
      if (result === "shared") toast.saved("Image shared.");
      if (result === "saved") toast.saved("Image saved.");
    } catch {
      toast.error("Could not share the image.");
    } finally {
      setBusy(null);
    }
  }

  function onSave() {
    if (!imageBlob) return;
    setBusy("save");
    try {
      downloadBlob(imageBlob, filename);
      toast.saved("Image saved.");
    } catch {
      toast.error("Could not save the image.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-[var(--venue-secondary,#F0F3DD)] shadow-sm">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${venueName} guest form QR. Hold this up for the guest to scan.`}
            className="block h-auto w-full"
          />
        ) : error ? (
          <div className="flex aspect-[1080/1680] flex-col items-center justify-center gap-4 px-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrPngDataUrl}
              alt="Guest form QR code"
              className="h-56 w-56 rounded-2xl bg-white p-3"
            />
            <p className="text-sm text-black/55">{error} You can still show the QR above.</p>
          </div>
        ) : (
          <div
            className="flex aspect-[1080/1680] items-center justify-center"
            aria-busy="true"
          >
            <p className="text-sm text-black/45">Preparing share image…</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!imageUrl}
          onClick={() => setHoldingUp(true)}
        >
          <Smartphone className="h-4 w-4" />
          Hold up for guest
        </Button>
        {canShareFiles ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={!imageBlob || busy !== null}
            onClick={() => void onShare()}
          >
            <Share2 className="h-4 w-4" />
            {busy === "share" ? "Sharing…" : "Share image"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={!imageBlob || busy !== null}
          onClick={onSave}
        >
          <Download className="h-4 w-4" />
          Save image
        </Button>
      </div>

      {holdingUp && imageUrl
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="fixed inset-0 z-[400] flex flex-col bg-[var(--venue-secondary,#F0F3DD)]"
              onClick={() => {
                if (!busy) setHoldingUp(false);
              }}
            >
              <h2 id={titleId} className="sr-only">
                Hold this up for the guest to scan
              </h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="min-h-0 w-full flex-1 object-contain"
              />
              <p className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 text-center text-[11px] text-black/40">
                Tap anywhere to close
              </p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
