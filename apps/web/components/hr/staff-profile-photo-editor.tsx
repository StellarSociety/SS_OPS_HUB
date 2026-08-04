"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, ImagePlus, Trash2, Upload } from "lucide-react";
import { DETACHED_FILE_FORM_ID } from "@/lib/hr/detached-file-form";
import { cn } from "@/lib/utils";

/** ICAO passport photo aspect (~35×45 mm). Client crops; server stores WebP. */
export const PASSPORT_RATIO = 7 / 9;
const OUTPUT_WIDTH = 420;
const OUTPUT_HEIGHT = Math.round(OUTPUT_WIDTH / PASSPORT_RATIO);
const WEBP_QUALITY = 0.82;

type StaffProfilePhotoEditorProps = {
  photoUrl: string;
  onPhotoUrlChange: (url: string) => void;
  onPhotoFileChange: (file: File | null) => void;
  /** Uncropped original — kept so framing can be re-edited after save. */
  onSourceFileChange?: (file: File | null) => void;
  /** True while the crop export is still running (disable Save upstream). */
  onPhotoBusyChange?: (busy: boolean) => void;
  /** True while the parent is saving / uploading the photo to storage. */
  uploading?: boolean;
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
    // crossOrigin on blob: URLs can prevent load/export in some browsers.
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}

/** Sibling object used for re-framing after the cropped photo is saved. */
export function staffPhotoSourceUrl(photoUrl: string): string | null {
  try {
    const url = new URL(photoUrl);
    const next = url.pathname.replace(
      /(\.[a-z0-9]+)$/i,
      (_match, ext: string) => {
        if (/-source\./i.test(url.pathname)) return ext;
        return `-source${ext}`;
      },
    );
    if (next === url.pathname) return null;
    url.pathname = next;
    return url.toString();
  } catch {
    return null;
  }
}

export function StaffProfilePhotoEditor({
  photoUrl,
  onPhotoUrlChange,
  onPhotoFileChange,
  onSourceFileChange,
  onPhotoBusyChange,
  uploading = false,
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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const dragDepthRef = useRef(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const prevPhotoUrlRef = useRef(photoUrl);
  const hasExportedRef = useRef(false);
  const wasUploadingRef = useRef(false);
  const completeTimerRef = useRef<number | null>(null);
  const [exportPending, setExportPending] = useState(false);

  const hasSource = Boolean(sourceUrl);
  const displayUrl = sourceUrl ?? (photoUrl || null);
  const canAdjust = Boolean(displayUrl) && !readOnly;
  const photoBusy =
    !readOnly &&
    Boolean(sourceUrl) &&
    (!naturalSize || exportPending);
  // Crop re-exports on every slider nudge — keep the bar for pick / load / save only.
  const showProgress = uploading || adjustLoading || readingFile;

  useEffect(() => {
    onPhotoBusyChange?.(photoBusy);
  }, [photoBusy, onPhotoBusyChange]);

  // Server Actions don't report byte progress — animate a bar while work runs.
  useEffect(() => {
    if (completeTimerRef.current != null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }

    if (readingFile || adjustLoading) {
      setUploadProgress((p) => (p == null || p > 35 ? 8 : Math.max(p, 8)));
      const id = window.setInterval(() => {
        setUploadProgress((p) => {
          const cur = p ?? 8;
          if (cur >= 35) return cur;
          return cur + 2 + Math.random() * 4;
        });
      }, 140);
      return () => window.clearInterval(id);
    }

    if (uploading) {
      wasUploadingRef.current = true;
      setUploadProgress((p) => Math.max(p ?? 30, 40));
      const id = window.setInterval(() => {
        setUploadProgress((p) => {
          const cur = p ?? 40;
          if (cur >= 92) return cur;
          return cur + 2 + Math.random() * 5;
        });
      }, 220);
      return () => window.clearInterval(id);
    }

    // Only celebrate completion after a real storage upload, not after crop prep.
    if (wasUploadingRef.current) {
      wasUploadingRef.current = false;
      setUploadProgress(100);
      completeTimerRef.current = window.setTimeout(() => {
        setUploadProgress(null);
        completeTimerRef.current = null;
      }, 650);
      return () => {
        if (completeTimerRef.current != null) {
          window.clearTimeout(completeTimerRef.current);
          completeTimerRef.current = null;
        }
      };
    }

    setUploadProgress(null);
  }, [uploading, adjustLoading, readingFile]);

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
    const urls = objectUrlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function trackObjectUrl(url: string) {
    objectUrlsRef.current.add(url);
    return url;
  }

  function revokeTracked(url: string | null) {
    if (!url || !url.startsWith("blob:")) return;
    if (objectUrlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }

  function resetCrop() {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  function endAdjustSession() {
    revokeTracked(sourceUrl);
    setSourceUrl(null);
    setNaturalSize(null);
    resetCrop();
    setOptionsOpen(false);
    setAdjustLoading(false);
    setReadingFile(false);
  }

  // Leave the framing session when the form becomes read-only (Done / cancel).
  useEffect(() => {
    if (!readOnly) return;
    endAdjustSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // After save/refresh, parent swaps the blob preview for the persisted HTTPS URL.
  useEffect(() => {
    const prev = prevPhotoUrlRef.current;
    prevPhotoUrlRef.current = photoUrl;
    if (
      prev.startsWith("blob:") &&
      Boolean(photoUrl) &&
      !photoUrl.startsWith("blob:") &&
      sourceUrl
    ) {
      endAdjustSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUrl]);

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

    const blob =
      (await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
      )) ??
      (await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", WEBP_QUALITY),
      ));
    // Some browsers omit MIME on canvas exports even when bytes are valid.
    if (!blob) return null;
    const isWebp = !blob.type || blob.type === "image/webp";
    const isJpeg = blob.type === "image/jpeg";
    if (!isWebp && !isJpeg) return null;
    return new File(
      [blob],
      isJpeg ? "staff-photo.jpg" : "staff-photo.webp",
      { type: isJpeg ? "image/jpeg" : "image/webp" },
    );
  }

  useEffect(() => {
    if (!sourceUrl || !naturalSize || readOnly) {
      setExportPending(false);
      return;
    }
    let cancelled = false;
    setExportPending(true);
    const delay = hasExportedRef.current ? 180 : 0;
    const timer = window.setTimeout(() => {
      void exportCropped()
        .then((file) => {
          if (cancelled) return;
          setExportPending(false);
          if (file) {
            hasExportedRef.current = true;
            onPhotoFileChange(file);
            const preview = trackObjectUrl(URL.createObjectURL(file));
            onPhotoUrlChange(preview);
          } else {
            hasExportedRef.current = false;
            onPhotoFileChange(null);
          }
        })
        .catch((err) => {
          console.warn(
            "[staff-photo] crop export failed:",
            err instanceof Error ? err.message : err,
          );
          if (cancelled) return;
          setExportPending(false);
          hasExportedRef.current = false;
          onPhotoFileChange(null);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl, naturalSize, zoom, offsetX, offsetY, readOnly]);

  function handleFile(file: File | null) {
    if (!file) return;
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (!looksLikeImage) return;
    hasExportedRef.current = false;
    setReadingFile(true);
    const url = trackObjectUrl(URL.createObjectURL(file));
    revokeTracked(sourceUrl);
    setSourceUrl(url);
    setNaturalSize(null);
    resetCrop();
    setOptionsOpen(true);
    onPhotoFileChange(null);
    onSourceFileChange?.(file);
    // Measure immediately so crop works even if the preview is in a hidden tab.
    void Promise.race([
      loadImage(url),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("image load timeout")), 8000);
      }),
    ])
      .then((img) => {
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        setReadingFile(false);
      })
      .catch((err) => {
        console.warn(
          "[staff-photo] could not read image:",
          err instanceof Error ? err.message : err,
        );
        // Don't leave Save blocked forever on a bad/unreadable file.
        setReadingFile(false);
        setSourceUrl(null);
        setNaturalSize(null);
        onPhotoFileChange(null);
        onSourceFileChange?.(null);
      });
  }

  function isFileDrag(e: React.DragEvent) {
    const types = Array.from(e.dataTransfer?.types ?? []);
    // Chrome/Safari use "Files"; Firefox may use "application/x-moz-file".
    if (types.includes("Files") || types.includes("application/x-moz-file")) {
      return true;
    }
    const items = e.dataTransfer?.items;
    if (!items) return false;
    for (let i = 0; i < items.length; i++) {
      if (items[i]?.kind === "file") return true;
    }
    return false;
  }

  function onEditorDragEnter(e: React.DragEvent) {
    if (readOnly || uploading || readingFile) return;
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDropActive(true);
  }

  function onEditorDragOver(e: React.DragEvent) {
    if (readOnly || uploading || readingFile) return;
    // Must preventDefault on dragover or the browser won't fire drop.
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!dropActive && isFileDrag(e)) setDropActive(true);
  }

  function onEditorDragLeave(e: React.DragEvent) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    dragDepthRef.current = 0;
    setDropActive(false);
  }

  function onEditorDrop(e: React.DragEvent) {
    if (readOnly || uploading || readingFile) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDropActive(false);
    const file =
      e.dataTransfer.files?.[0] ??
      (e.dataTransfer.items?.[0]?.kind === "file"
        ? e.dataTransfer.items[0].getAsFile()
        : null);
    handleFile(file);
  }

  function clearPhoto() {
    revokeTracked(sourceUrl);
    setSourceUrl(null);
    setNaturalSize(null);
    resetCrop();
    setOptionsOpen(false);
    setReadingFile(false);
    onCleared();
    onSourceFileChange?.(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function beginAdjust() {
    if (readOnly) return;
    if (hasSource) {
      setOptionsOpen((open) => !open);
      return;
    }
    if (!photoUrl) return;

    setAdjustLoading(true);
    const candidates = [staffPhotoSourceUrl(photoUrl), photoUrl].filter(
      (u): u is string => Boolean(u),
    );
    let loaded: string | null = null;
    let size: { w: number; h: number } | null = null;
    for (const candidate of candidates) {
      try {
        const img = await loadImage(candidate);
        loaded = candidate;
        size = { w: img.naturalWidth, h: img.naturalHeight };
        break;
      } catch {
        /* try next */
      }
    }
    setAdjustLoading(false);
    if (!loaded || !size) return;

    setSourceUrl(loaded);
    setNaturalSize(size);
    // Already-cropped passport images fill the frame at zoom 1; nudge zoom so
    // pan sliders/drag are immediately useful when no separate source exists.
    const isLikelyCropped =
      Math.abs(size.w / size.h - PASSPORT_RATIO) < 0.04 &&
      loaded === photoUrl;
    setZoom(isLikelyCropped ? 1.2 : 1);
    setOffsetX(0);
    setOffsetY(0);
    setOptionsOpen(true);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly || !hasSource || dropActive || uploading || readingFile) return;
    if (e.button !== 0) return;
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
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-md transition-colors",
        dropActive &&
          !readOnly &&
          "bg-[var(--venue-primary,#818a40)]/5 ring-2 ring-[var(--venue-primary,#818a40)]/30 ring-offset-2 ring-offset-transparent",
        className,
      )}
      onDragEnter={onEditorDragEnter}
      onDragOver={onEditorDragOver}
      onDragLeave={onEditorDragLeave}
      onDrop={onEditorDrop}
    >
      <div className="flex items-stretch gap-3">
        <div
          ref={frameRef}
          role={readOnly || displayUrl ? undefined : "button"}
          tabIndex={readOnly || displayUrl ? undefined : 0}
          onKeyDown={
            readOnly || displayUrl
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }
          }
          onClick={
            readOnly || displayUrl
              ? undefined
              : () => fileInputRef.current?.click()
          }
          className={cn(
            "relative h-[15.5rem] w-[calc(15.5rem*7/9)] shrink-0 overflow-hidden rounded-md border border-black/10 bg-black/[0.04] transition-colors",
            hasSource && !readOnly && !dropActive && "cursor-grab active:cursor-grabbing",
            !readOnly && !displayUrl && "cursor-pointer hover:bg-black/[0.06]",
            dropActive &&
              !readOnly &&
              "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)]/10",
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
              crossOrigin={
                (hasSource ? sourceUrl : displayUrl) &&
                /^https?:\/\//i.test((hasSource ? sourceUrl : displayUrl)!)
                  ? "anonymous"
                  : undefined
              }
              className={cn(
                "pointer-events-none absolute select-none",
                // Cover the frame until crop metrics are ready (avoids blank box).
                live
                  ? "left-1/2 top-1/2 max-w-none"
                  : "inset-0 h-full w-full object-cover",
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
                {readOnly
                  ? "No photo yet"
                  : "Drop photo or click to upload"}
              </p>
            </div>
          )}
          {dropActive && !readOnly ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--venue-primary,#818a40)]/15">
              <p className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-[#3D421F] shadow-sm">
                Drop to upload
              </p>
            </div>
          ) : null}
          {showProgress || uploadProgress != null ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/55 to-transparent px-2 pb-2 pt-6">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/35">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-150 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(4, uploadProgress ?? 8))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-end justify-between gap-2">
          <div className="flex w-[6.75rem] flex-col gap-1.5">
            <button
              type="button"
              disabled={readOnly || uploading || readingFile}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                btnClass,
                "border-[var(--venue-primary,#818a40)]/35 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90",
              )}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              Upload
            </button>
            {displayUrl ? (
              <button
                type="button"
                disabled={readOnly || uploading || readingFile}
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
            {canAdjust ? (
              <button
                type="button"
                aria-expanded={optionsOpen}
                disabled={adjustLoading || uploading || readingFile}
                onClick={() => void beginAdjust()}
                className={cn(
                  btnClass,
                  optionsOpen
                    ? "border-[#3D421F]/30 bg-[#3D421F]/10 text-[#3D421F]"
                    : "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30",
                )}
              >
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" />
                {adjustLoading ? "Loading…" : "Adjust"}
              </button>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.png,.jpg,.jpeg,.webp,.heic,.heif"
              form={DETACHED_FILE_FORM_ID}
              className="hidden"
              disabled={readOnly || uploading || readingFile}
              onChange={(e) => {
                handleFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          {hasSource && !readOnly && optionsOpen ? (
            <div className="w-full space-y-1.5 rounded-md border border-black/10 bg-black/[0.03] px-2 py-1.5">
              <SliderField
                label="H"
                value={offsetX}
                min={-1}
                max={1}
                step={0.01}
                onChange={setOffsetX}
              />
              <SliderField
                label="V"
                value={offsetY}
                min={-1}
                max={1}
                step={0.01}
                onChange={setOffsetY}
              />
              <SliderField
                label="Z"
                value={zoom}
                min={1}
                max={3}
                step={0.01}
                onChange={setZoom}
              />
              <p className="text-right text-[9px] leading-snug text-black/40">
                Drag preview · Save to apply
              </p>
            </div>
          ) : readOnly ? (
            <p className="max-w-[6.75rem] text-right text-[11px] leading-snug text-black/40">
              {displayUrl
                ? "Click Edit to upload or adjust this photo."
                : "Click Edit, then Upload a passport-ratio photo."}
            </p>
          ) : !displayUrl ? (
            <p className="max-w-[6.75rem] text-right text-[11px] leading-snug text-black/40">
              Drag a photo onto the frame, or use Upload. Passport ratio (35×45).
            </p>
          ) : (
            <p className="max-w-[6.75rem] text-right text-[11px] leading-snug text-black/40">
              Open Adjust to reposition, or Upload a new photo.
            </p>
          )}
        </div>
      </div>

      {showProgress || uploadProgress != null ? (
        <div
          className="space-y-1.5"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            uploadProgress != null ? Math.round(uploadProgress) : undefined
          }
          aria-label="Profile photo upload progress"
        >
          <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-[#3D421F]/80">
            <span>
              {uploadProgress != null && uploadProgress >= 100
                ? "Done"
                : adjustLoading
                  ? "Loading photo…"
                  : readingFile
                    ? "Reading photo…"
                    : "Uploading photo…"}
            </span>
            <span className="tabular-nums text-black/45">
              {uploadProgress != null ? `${Math.round(uploadProgress)}%` : "…"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className={cn(
                "h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-150 ease-out",
                uploadProgress != null &&
                  uploadProgress >= 100 &&
                  "animate-pulse",
              )}
              style={{
                width: `${Math.min(100, Math.max(4, uploadProgress ?? 8))}%`,
              }}
            />
          </div>
        </div>
      ) : null}
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
  const fullLabel =
    label === "H" ? "Horizontal" : label === "V" ? "Vertical" : label === "Z" ? "Zoom" : label;
  return (
    <label className="flex items-center gap-2" title={fullLabel}>
      <span className="w-3 shrink-0 text-[9px] font-semibold uppercase tracking-wide text-black/45">
        {label}
      </span>
      <input
        type="range"
        aria-label={fullLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-black/10 accent-[var(--venue-primary)]"
      />
    </label>
  );
}
