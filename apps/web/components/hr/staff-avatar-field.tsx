"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Camera,
  Crop,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AvatarCropDialog } from "@/components/profile/avatar-crop-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { saveStaffPhoto } from "@/lib/actions/hr";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import {
  STAFF_PHOTO_ACCEPT,
  STAFF_PHOTO_CROP_OUTPUT_PX,
  STAFF_PHOTO_MAX_UPLOAD_BYTES,
  staffPhotoSourceUrlFromCropUrl,
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
  empNo?: string | null;
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

function extensionForOriginal(file: File): string {
  const fromName = file.name.match(/(\.[a-z0-9]+)$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const type = file.type.toLowerCase();
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  if (type.includes("heic") || type.includes("heif")) return ".heic";
  return ".jpg";
}

export function StaffAvatarField({
  staffId,
  photoUrl,
  fullName,
  empNo,
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
  /** Uncropped file as picked — uploaded to WorkDrive (not the WebP crop). */
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dragDepthRef = useRef(0);

  const initials = getUserInitials(fullName, emailFallback ?? "?");
  const displayName = fullName?.trim() || "Employee";
  const employeeNo = empNo?.trim() || "";

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

  function persist(
    file: File | null,
    clear = false,
    workDriveOriginal: File | null = null,
  ) {
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
      // Full uncropped image — stored as *-source.webp for later re-crop.
      if (workDriveOriginal) {
        formData.set("photo_original", workDriveOriginal);
      }
    }

    startTransition(async () => {
      const result = await saveStaffPhoto(staffId, formData);
      if (result.error) {
        toast.error(result.error);
        setPreview(photoUrl);
        return;
      }
      const next = result.photo_url ?? null;
      setPreview(next);
      onPhotoUrlChange?.(next);
      router.refresh();

      if (clear) {
        toast.saved("Profile photo removed.");
        return;
      }

      if (workDriveOriginal && employeeNo && displayName) {
        const ext = extensionForOriginal(workDriveOriginal);
        const named = new File(
          [workDriveOriginal],
          `${employeeNo} - ${displayName}${ext}`,
          {
            type: workDriveOriginal.type || "application/octet-stream",
            lastModified: workDriveOriginal.lastModified,
          },
        );
        const wd = await uploadStaffDocumentViaApi({
          staffId,
          empNo: employeeNo,
          fullName: displayName,
          docKind: "profile_photo",
          file: named,
        });
        if (!wd.ok) {
          toast.error(
            `Photo saved, but WorkDrive upload failed: ${wd.error}`,
          );
          return;
        }
        toast.saved(`Profile photo saved and uploaded to WorkDrive.`);
        return;
      }

      if (workDriveOriginal && (!employeeNo || !displayName)) {
        toast.saved(
          "Profile photo saved. Add employee number and name to sync to WorkDrive.",
        );
        return;
      }

      toast.saved("Profile photo saved.");
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
      // Keep the as-picked file for WorkDrive; crop uses a decodable copy.
      setOriginalFile(file);
      let next = file;
      if (isHeicLikeFile(file)) {
        setDecoding(true);
        try {
          next = await ensureBrowserDecodableImage(file);
        } catch {
          toast.error(
            "Could not open this HEIC photo. Export it as JPEG or PNG from your phone, then try again.",
          );
          setOriginalFile(null);
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

  /** Re-open crop/zoom using the full source image when available. */
  function openCropForCurrentPreview() {
    if (!preview || busy) return;

    void (async () => {
      setDecoding(true);
      try {
        const sourceUrl = staffPhotoSourceUrlFromCropUrl(preview);
        let blob: Blob | null = null;
        let usedFullSource = false;

        if (sourceUrl) {
          const sourceRes = await fetch(sourceUrl);
          if (sourceRes.ok) {
            const sourceBlob = await sourceRes.blob();
            if (sourceBlob.size > 0) {
              blob = sourceBlob;
              usedFullSource = true;
            }
          }
        }

        if (!blob) {
          const res = await fetch(preview);
          if (!res.ok) throw new Error("fetch failed");
          blob = await res.blob();
          if (!blob.size) throw new Error("empty");
        }

        const type = blob.type || "image/webp";
        const ext =
          type.includes("jpeg") || type.includes("jpg")
            ? ".jpg"
            : type.includes("png")
              ? ".png"
              : ".webp";
        const file = new File(
          [blob],
          usedFullSource ? `photo-source${ext}` : `current-photo${ext}`,
          { type },
        );
        // Re-crop from stored source — keep existing WorkDrive original.
        setOriginalFile(null);
        setPickOpen(false);
        setCropFile(file);
        setCropOpen(true);

        if (!usedFullSource) {
          toast.alert(
            "Only the cropped photo is available. Upload a new image to enable full zoom and pan.",
          );
        }
      } catch {
        toast.error("Could not open this photo for cropping.");
      } finally {
        setDecoding(false);
      }
    })();
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
                      Click the photo to adjust crop and zoom from the full
                      image, or upload a new one. New originals sync to
                      WorkDrive automatically.
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
                    {preview ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={openCropForCurrentPreview}
                        className="group relative h-[200px] w-[200px] overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10 outline-none transition focus-visible:ring-2 focus-visible:ring-[#3D421F]/40 focus-visible:ring-offset-2 disabled:opacity-60"
                        aria-label="Adjust crop and position"
                      >
                        <Image
                          src={preview}
                          alt={displayName}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          <Crop className="h-6 w-6 text-white" aria-hidden />
                          <span className="text-xs font-semibold text-white">
                            Adjust crop
                          </span>
                        </span>
                        {decoding ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                            <Loader2 className="h-6 w-6 animate-spin text-white" />
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <div className="relative flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#3D421F] shadow-md ring-1 ring-black/10">
                        <span className="text-4xl font-medium text-white">
                          {initials}
                        </span>
                      </div>
                    )}
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

                  <div className="flex flex-nowrap items-center justify-between gap-2 border-t border-black/5 pt-1">
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
                        className="shrink-0 whitespace-nowrap text-black/55 hover:bg-black/5"
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
                      className="shrink-0 whitespace-nowrap border-black/10 bg-white text-[#3D421F]"
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
          setOriginalFile(null);
        }}
        onConfirm={(cropped) => {
          const original = originalFile;
          setCropOpen(false);
          setCropFile(null);
          setOriginalFile(null);
          const objectUrl = URL.createObjectURL(cropped);
          setPreview(objectUrl);
          persist(cropped, false, original);
        }}
      />
    </>
  );
}
