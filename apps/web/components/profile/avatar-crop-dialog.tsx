"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { USER_AVATAR_CROP_OUTPUT_PX } from "@/lib/user/avatar-upload-constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEBP_QUALITY = 0.82;

type AvatarCropDialogProps = {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (cropped: File) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function transformForFrame(
  naturalSize: { w: number; h: number },
  frameW: number,
  frameH: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const cover = Math.max(frameW / naturalSize.w, frameH / naturalSize.h);
  const scale = cover * zoom;
  const displayW = naturalSize.w * scale;
  const displayH = naturalSize.h * scale;
  const maxX = Math.max(0, (displayW - frameW) / 2);
  const maxY = Math.max(0, (displayH - frameH) / 2);
  return {
    displayW,
    displayH,
    tx: offsetX * maxX,
    ty: offsetY * maxY,
    maxX,
    maxY,
  };
}

export function AvatarCropDialog({
  open,
  file,
  onClose,
  onConfirm,
}: AvatarCropDialogProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [frameSize, setFrameSize] = useState({ w: 240, h: 240 });
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, exporting]);

  useEffect(() => {
    if (!open || !file) {
      setSourceUrl(null);
      setNaturalSize(null);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setNaturalSize(null);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || !open) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setFrameSize({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  async function exportCropped(): Promise<File | null> {
    if (!sourceUrl || !naturalSize) return null;
    const img = await loadImage(sourceUrl);
    const size = USER_AVATAR_CROP_OUTPUT_PX;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const { displayW, displayH, tx, ty } = transformForFrame(
      naturalSize,
      size,
      size,
      zoom,
      offsetX,
      offsetY,
    );
    const left = (size - displayW) / 2 + tx;
    const top = (size - displayH) / 2 + ty;
    ctx.fillStyle = "#f5f5f0";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, left, top, displayW, displayH);

    const blob =
      (await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
      )) ??
      (await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", WEBP_QUALITY),
      ));
    if (!blob) return null;
    const isWebp = blob.type === "image/webp";
    return new File([blob], isWebp ? "avatar.webp" : "avatar.jpg", {
      type: isWebp ? "image/webp" : "image/jpeg",
    });
  }

  async function handleSave() {
    setExporting(true);
    try {
      const cropped = await exportCropped();
      if (!cropped) return;
      onConfirm(cropped);
    } finally {
      setExporting(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!naturalSize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetX,
      originY: offsetY,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !naturalSize) return;
    const { maxX, maxY } = transformForFrame(
      naturalSize,
      frameSize.w,
      frameSize.h,
      zoom,
      offsetX,
      offsetY,
    );
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextX =
      maxX > 0 ? dragRef.current.originX + dx / maxX : dragRef.current.originX;
    const nextY =
      maxY > 0 ? dragRef.current.originY + dy / maxY : dragRef.current.originY;
    setOffsetX(clamp(nextX, -1, 1));
    setOffsetY(clamp(nextY, -1, 1));
  }

  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  if (!open || !file || !mounted) return null;

  const live = naturalSize
    ? transformForFrame(
        naturalSize,
        frameSize.w,
        frameSize.h,
        zoom,
        offsetX,
        offsetY,
      )
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Crop profile photo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose();
      }}
    >
      <div className="flex max-h-[min(100dvh,100vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg leading-tight text-[#3D421F]">
              Profile photo
            </h2>
            <p className="text-xs text-black/50">
              Drag, zoom, and position your photo in the circle.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="shrink-0 rounded-md p-1 text-black/50 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div
              ref={frameRef}
              className={cn(
                "relative aspect-square w-[min(100%,280px,38dvh)] max-w-full shrink-0 overflow-hidden rounded-full border-2 border-black/10 bg-black/[0.04] shadow-inner",
                naturalSize && "cursor-grab active:cursor-grabbing",
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {sourceUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceUrl}
                  alt="Crop preview"
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={
                    live
                      ? {
                          width: live.displayW,
                          height: live.displayH,
                          marginLeft: -live.displayW / 2,
                          marginTop: -live.displayH / 2,
                          transform: `translate(${live.tx}px, ${live.ty}px)`,
                        }
                      : {
                          width: "100%",
                          height: "100%",
                          marginLeft: "-50%",
                          marginTop: "-50%",
                          objectFit: "cover",
                        }
                  }
                  onLoad={(e) => {
                    setNaturalSize({
                      w: e.currentTarget.naturalWidth,
                      h: e.currentTarget.naturalHeight,
                    });
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="grid shrink-0 gap-2.5 rounded-lg border border-black/10 bg-black/[0.03] p-3 sm:grid-cols-3 sm:gap-3">
            <SliderField
              label="Horizontal"
              value={offsetX}
              min={-1}
              max={1}
              step={0.01}
              onChange={setOffsetX}
              disabled={!naturalSize || exporting}
            />
            <SliderField
              label="Vertical"
              value={offsetY}
              min={-1}
              max={1}
              step={0.01}
              onChange={setOffsetY}
              disabled={!naturalSize || exporting}
            />
            <SliderField
              label="Zoom"
              value={zoom}
              min={1}
              max={3}
              step={0.01}
              onChange={setZoom}
              disabled={!naturalSize || exporting}
            />
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-black/5 pt-1 sm:pt-0">
            <Button
              type="button"
              variant="outline"
              disabled={exporting}
              onClick={onClose}
              className="border-black/10 bg-white text-[#3D421F]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!naturalSize || exporting}
              onClick={() => void handleSave()}
              className="bg-[#3D421F] text-white hover:bg-[#3D421F]/90"
            >
              {exporting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save photo"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("block space-y-1", disabled && "opacity-50")}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-black/10 accent-[var(--venue-primary)] disabled:cursor-not-allowed"
      />
    </label>
  );
}
