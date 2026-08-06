"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Camera, ImagePlus, Loader2, Trash2, Upload, X } from "lucide-react";
import { AvatarCropDialog } from "@/components/profile/avatar-crop-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { saveStaffPhoto } from "@/lib/actions/hr";
import {
  STAFF_PHOTO_ACCEPT,
  STAFF_PHOTO_CROP_OUTPUT_PX,
  STAFF_PHOTO_MAX_UPLOAD_BYTES,
} from "@/lib/hr/staff-photo-constants";
import {
  ensureBrowserDecodableImage,
  isHeicLikeFile,
} from "@/lib/hr/decode-heic-for-crop";
import { getUserInitials } from "@/lib/user/display";
import { cn } from "@/lib/utils";

type StaffAvatarFieldProps = {
  staffId: string | null;
  photoUrl: string | null;
  fullName: string | null;
  emailFallback?: string | null;
  canEdit: boolean;
  /** Called after a successful upload/clear so parents can sync local state. */
  onPhotoUrlChange?: (url: string | null) => void;
  className?: string;
  sizeClassName?: string;
};

function isAcceptedImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name);
}

export function StaffAvatarField({
  staffId,
  photoUrl,
  fullName,
  emailFallback,
  canEdit,
  onPhotoUrlChange,
  className,
  sizeClassName = "h-28 w-28 sm:h-32 sm:w-32",
}: StaffAvatarFieldProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(photoUrl);
  const [pickOpen, setPickOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dragDepthRef = useRef(0);

  const initials = getUserInitials(fullName, emailFallback ?? "?");
  const displayName = fullName?.trim() || "Employee";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPreview(photoUrl);
  }, [photoUrl]);

  const busy = isPending || decoding;

  useEffect(() => {
    if (!pickOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickOpen]);

  useEffect(() => {
    if (!pickOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setPickOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickOpen, busy]);

  function persist(file: File | null, clear = false) {
    if (!staffId) {
      toast.error("Save the employee record first, then upload a photo.");
      return;
    }
    if (!clear && (!file || file.size === 0)) return;

    const formData = new FormData();
    if (clear) {
      formData.set("photo_clear", "1");
    } else if (file) {
      formData.set("photo", file);
    }

    startTransition(async () => {
      const result = await saveStaffPhoto(staffId, formData);
      if (result.error) {
        toast.error(result.error);
        setPreview(photoUrl);
        return;
      }
      const next = result.photo_url ?? null;
      toast.saved(
        clear ? "Profile photo removed." : "Profile photo saved.",
      );
      setPreview(next);
      onPhotoUrlChange?.(next);
      router.refresh();
    });
  }

  function acceptFile(file: File | null) {
    if (!file) return;
    if (file.size > STAFF_PHOTO_MAX_UPLOAD_BYTES) {
      toast.error("Profile photo must be 5 MB or smaller.");
      return;
    }
    if (!isAcceptedImage(file)) {
      toast.error("Profile photo must be an image file.");
      return;
    }

    void (async () => {
      let next = file;
      if (isHeicLikeFile(file)) {
        setDecoding(true);
        try {
          next = await ensureBrowserDecodableImage(file);
        } catch {
          toast.error(
            "Could not open this HEIC photo. Export it as JPEG or PNG from your phone, then try again.",
          );
          return;
        } finally {
          setDecoding(false);
        }
      }
      setPickOpen(false);
      setCropFile(next);
      setCropOpen(true);
    })();
  }

  function openPicker() {
    if (!canEdit || busy) return;
    if (!staffId) {
      toast.error("Save the employee record first, then upload a photo.");
      return;
    }
    setPickOpen(true);
  }

  const thumb = (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10",
        sizeClassName,
        className,
      )}
    >
      {preview ? (
        <Image
          src={preview}
          alt={displayName}
          fill
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#3D421F] text-3xl font-medium text-white sm:text-4xl">
          {initials}
        </div>
      )}
      {canEdit ? (
        <span
          className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/45 via-transparent to-transparent pb-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3D421F] shadow-sm">
            <Camera className="h-3 w-3" />
            Photo
          </span>
        </span>
      ) : null}
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </span>
      ) : null}
    </div>
  );

  return (
    <>
      {canEdit ? (
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          className="group relative rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[#3D421F]/40 focus-visible:ring-offset-2 disabled:opacity-60"
          aria-label={
            preview ? "Change employee profile photo" : "Upload employee profile photo"
          }
        >
          {thumb}
        </button>
      ) : (
        thumb
      )}

      <input
        ref={inputRef}
        type="file"
        accept={STAFF_PHOTO_ACCEPT}
        className="hidden"
        disabled={busy || !canEdit}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          acceptFile(file);
        }}
      />

      {mounted && pickOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Employee profile photo"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) setPickOpen(false);
              }}
            >
              <div className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
                <div className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5 sm:py-4">
                  <div className="min-w-0">
                    <h2 className="font-serif text-lg leading-tight text-[#3D421F]">
                      Employee profile photo
                    </h2>
                    <p className="text-xs text-black/50">
                      Upload or drop an image, then crop and zoom before saving.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickOpen(false)}
                    disabled={busy}
                    className="shrink-0 rounded-md p-1 text-black/50 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
                  <div className="mx-auto">
                    <div
                      className={cn(
                        "relative h-24 w-24 overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10",
                      )}
                    >
                      {preview ? (
                        <Image
                          src={preview}
                          alt={displayName}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#3D421F] text-2xl font-medium text-white">
                          {initials}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                      dropActive
                        ? "border-[#3D421F] bg-[#3D421F]/10"
                        : "border-black/15 bg-white/50 hover:border-[#3D421F]/40 hover:bg-white/80",
                    )}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragDepthRef.current += 1;
                      setDropActive(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                      if (dragDepthRef.current === 0) setDropActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragDepthRef.current = 0;
                      setDropActive(false);
                      const file = e.dataTransfer.files?.[0] ?? null;
                      acceptFile(file);
                    }}
                  >
                    <ImagePlus className="h-8 w-8 text-[#3D421F]/55" aria-hidden />
                    <p className="text-sm font-medium text-[#3D421F]">
                      {decoding
                        ? "Converting HEIC…"
                        : "Drag and drop an image here"}
                    </p>
                    <p className="text-xs text-black/45">
                      PNG, JPEG, WebP, GIF, AVIF, or HEIC up to 5 MB
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => inputRef.current?.click()}
                      className="mt-1 border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    >
                      {decoding ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {decoding ? "Converting…" : "Choose file"}
                    </Button>
                  </div>

                  <div className="flex flex-wrap justify-between gap-2 border-t border-black/5 pt-1">
                    {preview ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setPickOpen(false);
                          persist(null, true);
                        }}
                        className="text-black/55 hover:bg-black/5"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove photo
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setPickOpen(false)}
                      className="border-black/10 bg-white text-[#3D421F]"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <AvatarCropDialog
        open={cropOpen}
        file={cropFile}
        outputPx={STAFF_PHOTO_CROP_OUTPUT_PX}
        title="Employee profile photo"
        description="Drag, zoom, and position the photo in the circle."
        confirmLabel="Save photo"
        onClose={() => {
          setCropOpen(false);
          setCropFile(null);
        }}
        onConfirm={(cropped) => {
          setCropOpen(false);
          setCropFile(null);
          const objectUrl = URL.createObjectURL(cropped);
          setPreview(objectUrl);
          persist(cropped);
        }}
      />
    </>
  );
}
