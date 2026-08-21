"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  removeGroupFavicon,
  uploadGroupFavicon,
} from "@/lib/actions/group-branding";
import {
  DEFAULT_GROUP_FAVICON_URL,
  type GroupFaviconState,
} from "@/lib/group/branding";
import { cn } from "@/lib/utils";

const lightOutlineButtonClass =
  "border-black/15 bg-white text-[#3D421F] hover:bg-black/5 hover:text-[#3D421F]";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

type GroupFaviconPanelProps = {
  initial: GroupFaviconState;
};

export function GroupFaviconPanel({ initial }: GroupFaviconPanelProps) {
  const [faviconUrl, setFaviconUrl] = useState(initial.faviconUrl);
  const [storedUrl, setStoredUrl] = useState(initial.storedFaviconUrl);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const canClear = Boolean(storedUrl);

  function handleFile(file: File) {
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadGroupFavicon(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.faviconUrl) {
        setFaviconUrl(result.faviconUrl);
        setStoredUrl(result.faviconUrl);
      }
      toast.uploaded(result.success ?? "Group favicon uploaded.");
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeGroupFavicon();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setFaviconUrl(DEFAULT_GROUP_FAVICON_URL);
      setStoredUrl(null);
      toast.saved(result.success ?? "Default group favicon restored.");
    });
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex min-h-[7.5rem] flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">
            Stellar Society Group Favicon
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Browser tab icon for sign-in and Global. Venue pages keep their own
            favicon. Upload a square image, or clear to restore the default.
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            canClear
              ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
              : "bg-black/5 text-black/45",
          )}
        >
          {canClear ? "Uploaded" : "Default"}
        </span>
      </div>

      <button
        type="button"
        disabled={isPending}
        className={cn(
          "mt-4 flex h-56 w-full shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-6 transition-colors",
          isDragging
            ? "border-[var(--venue-primary)] bg-[var(--venue-primary)]/10"
            : "border-black/20 bg-[#F4F4F4] hover:border-[var(--venue-primary)]/50",
          isPending && "cursor-not-allowed opacity-60",
        )}
        onClick={() => {
          if (!isPending) fileInput.current?.click();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isPending) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (isPending) return;
          const file = event.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        <div className="flex h-[88px] w-full items-center justify-center">
          <div className="w-full max-w-[240px] overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
            <div className="flex items-center gap-2 bg-[#E4E4E4] px-2.5 py-1.5">
              <div className="flex shrink-0 gap-1" aria-hidden>
                <span className="size-1.5 rounded-full bg-[#FF5F57]" />
                <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
                <span className="size-1.5 rounded-full bg-[#28C840]" />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white px-2 py-1 shadow-sm">
                {faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={faviconUrl}
                    alt=""
                    className="size-3.5 shrink-0 object-contain"
                  />
                ) : (
                  <ImageIcon className="size-3.5 shrink-0 text-black/25" />
                )}
                <span className="truncate text-[11px] text-[#3D421F]">
                  Stellar Society
                </span>
              </div>
            </div>
            <div className="flex h-9 items-center justify-center bg-[#F7F7F7]">
              {faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={faviconUrl}
                  alt="Stellar Society Group favicon"
                  className="size-6 object-contain"
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-black/20" />
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-black/50">
          {isDragging ? "Drop to upload new" : "Drag & drop or click to upload new"}
        </p>
        <p className="mt-0.5 text-[10px] text-black/40">PNG · JPG · WebP · SVG</p>
      </button>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = "";
        }}
      />

      <div className="mt-auto flex gap-2 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(lightOutlineButtonClass, "min-w-0 flex-1")}
          disabled={isPending}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-4 w-4 shrink-0" />
          {isPending ? "Uploading…" : "Upload new"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(lightOutlineButtonClass, "min-w-0 flex-1")}
          disabled={isPending || !canClear}
          onClick={handleRemove}
          title={
            canClear
              ? "Remove uploaded favicon and restore the built-in default"
              : "Using the built-in default"
          }
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          Clear
        </Button>
      </div>
    </Card>
  );
}
