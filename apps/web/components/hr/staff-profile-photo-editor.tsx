"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, ImagePlus, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/** ICAO passport photo aspect (~35×45 mm). Compact JPEG for storage. */
export const PASSPORT_RATIO = 7 / 9;
const OUTPUT_WIDTH = 420;
const OUTPUT_HEIGHT = Math.round(OUTPUT_WIDTH / PASSPORT_RATIO);
const JPEG_QUALITY = 0.82;

type StaffProfilePhotoEditorProps = {
  photoUrl: string;
  onPhotoUrlChange: (url: string) => void;
  onPhotoFileChange: (file: File | null) => void;
  onCleared: () => void;
  readOnly?: boolean;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

export function StaffProfilePhotoEditor({
  photoUrl,
  onPhotoUrlChange,
  onPhotoFileChange,
  onCleared,
  readOnly = false,
  className,
}: StaffProfilePhotoEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [frameSize, setFrameSize] = useState({ w: 112, h: 144 });
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(true);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const hasSource = Boolean(sourceUrl);
  const displayUrl = sourceUrl ?? (photoUrl || null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
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
  }, []);

  useEffect(() => {
    return () => {
      if (sourceUrl?.startsWith("blob:")) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  function resetCrop() {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  function transformForFrame(frameW: number, frameH: number) {
    if (!naturalSize) {
      return { displayW: frameW, displayH: frameH, tx: 0, ty: 0, maxX: 0, maxY: 0 };
    }
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

  async function exportCropped(): Promise<File | null> {
    if (!sourceUrl || !naturalSize) return null;
    const img = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const { displayW, displayH, tx, ty } = transformForFrame(
      OUTPUT_WIDTH,
      OUTPUT_HEIGHT,
    );
    const left = (OUTPUT_WIDTH - displayW) / 2 + tx;
    const top = (OUTPUT_HEIGHT - displayH) / 2 + ty;
    ctx.fillStyle = "#f5f5f0";
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    ctx.drawImage(img, left, top, displayW, displayH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return null;
    return new File([blob], "staff-photo.jpg", { type: "image/jpeg" });
  }

  useEffect(() => {
    if (!sourceUrl || !naturalSize || readOnly) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void exportCropped().then((file) => {
        if (!cancelled && file) {
          onPhotoFileChange(file);
          const preview = URL.createObjectURL(file);
          onPhotoUrlChange(preview);
        }
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl, naturalSize, zoom, offsetX, offsetY, readOnly]);

  function handleFile(file: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    if (sourceUrl?.startsWith("blob:")) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(url);
    setNaturalSize(null);
    resetCrop();
    setOptionsOpen(true);
    onPhotoFileChange(null);
  }

  function clearPhoto() {
    if (sourceUrl?.startsWith("blob:")) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    setNaturalSize(null);
    resetCrop();
    setOptionsOpen(false);
    onCleared();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly || !hasSource) return;
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
    const { maxX, maxY } = transformForFrame(frameSize.w, frameSize.h);
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

  const live =
    hasSource && naturalSize
      ? transformForFrame(frameSize.w, frameSize.h)
      : null;

  const btnClass =
    "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-40";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-stretch gap-3">
        <div
          ref={frameRef}
          className={cn(
            "relative h-[15.5rem] w-[calc(15.5rem*7/9)] shrink-0 overflow-hidden rounded-md border border-black/10 bg-black/[0.04]",
            hasSource && !readOnly && "cursor-grab active:cursor-grabbing",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hasSource ? sourceUrl! : displayUrl}
              alt="Staff profile"
              draggable={false}
              className={cn(
                "pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none",
                !hasSource &&
                  "h-full w-full -translate-x-1/2 -translate-y-1/2 object-cover",
              )}
              style={
                live
                  ? {
                      width: live.displayW,
                      height: live.displayH,
                      marginLeft: -live.displayW / 2,
                      marginTop: -live.displayH / 2,
                      transform: `translate(${live.tx}px, ${live.ty}px)`,
                    }
                  : undefined
              }
              onLoad={(e) => {
                if (hasSource) {
                  setNaturalSize({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  });
                }
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
              <ImagePlus className="h-7 w-7 text-black/25" />
              <p className="text-[10px] leading-tight text-black/40">
                Passport photo
              </p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-end justify-between gap-2">
          <div className="flex w-[6.75rem] flex-col gap-1.5">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                btnClass,
                "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30",
              )}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              {displayUrl ? "Replace" : "Upload"}
            </button>
            {displayUrl ? (
              <button
                type="button"
                disabled={readOnly}
                onClick={clearPhoto}
                className={cn(
                  btnClass,
                  "border-black/10 bg-white text-black/55 hover:bg-black/5",
                )}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                Remove
              </button>
            ) : null}
            {hasSource && !readOnly ? (
              <button
                type="button"
                aria-expanded={optionsOpen}
                onClick={() => setOptionsOpen((open) => !open)}
                className={cn(
                  btnClass,
                  optionsOpen
                    ? "border-[#3D421F]/30 bg-[#3D421F]/10 text-[#3D421F]"
                    : "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30",
                )}
              >
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" />
                Adjust
              </button>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={readOnly}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {hasSource && !readOnly && optionsOpen ? (
            <div className="w-full space-y-2.5 rounded-md border border-black/10 bg-black/[0.03] p-2.5">
              <SliderField
                label="Horizontal"
                value={offsetX}
                min={-1}
                max={1}
                step={0.01}
                onChange={setOffsetX}
              />
              <SliderField
                label="Vertical"
                value={offsetY}
                min={-1}
                max={1}
                step={0.01}
                onChange={setOffsetY}
              />
              <SliderField
                label="Zoom"
                value={zoom}
                min={1}
                max={3}
                step={0.01}
                onChange={setZoom}
              />
              <p className="text-right text-[10px] leading-snug text-black/45">
                Drag the preview or use the sliders to choose what stays visible
                in the frame.
              </p>
            </div>
          ) : !hasSource ? (
            <p className="max-w-[6.75rem] text-right text-[11px] leading-snug text-black/40">
              Upload a clear headshot. Passport ratio (35×45).
            </p>
          ) : (
            <p className="max-w-[6.75rem] text-right text-[11px] leading-snug text-black/40">
              Drag the preview, or open Adjust for sliders.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-black/10 accent-[var(--venue-primary)]"
      />
    </label>
  );
}
