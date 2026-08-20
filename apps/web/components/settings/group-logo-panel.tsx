"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { GroupLogo } from "@/components/brand/group-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { removeGroupLogo, uploadGroupLogo } from "@/lib/actions/group-branding";
import {
  DEFAULT_GROUP_LOGO_URL,
  type GroupLogoState,
} from "@/lib/group/branding";
import { cn } from "@/lib/utils";

const lightOutlineButtonClass =
  "border-black/15 bg-white text-[#3D421F] hover:bg-black/5 hover:text-[#3D421F]";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

type GroupLogoPanelProps = {
  initial: GroupLogoState;
};

export function GroupLogoPanel({ initial }: GroupLogoPanelProps) {
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [storedUrl, setStoredUrl] = useState(initial.storedUrl);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const canClear = Boolean(storedUrl);

  function handleFile(file: File) {
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadGroupLogo(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.logoUrl) {
        setLogoUrl(result.logoUrl);
        setStoredUrl(result.logoUrl);
      }
      toast.uploaded(result.success ?? "Group logo uploaded.");
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeGroupLogo();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setLogoUrl(DEFAULT_GROUP_LOGO_URL);
      setStoredUrl(null);
      toast.saved(result.success ?? "Default group logo restored.");
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">
            Stellar Society Group Logo
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Shown on the sign-in screen. Upload a replacement or clear to restore
            the built-in wordmark.
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
          "mt-4 flex min-h-[160px] w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-black px-6 py-8 transition-colors",
          isDragging
            ? "border-[var(--venue-primary)]"
            : "border-black/20 hover:border-[var(--venue-primary)]/50",
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
        {logoUrl ? (
          <GroupLogo src={logoUrl} className="h-auto w-full max-w-[280px]" />
        ) : (
          <ImageIcon className="h-8 w-8 text-white/30" />
        )}
        <p className="mt-3 text-xs font-medium text-white/55">
          {isDragging ? "Drop to upload new" : "Drag & drop or click to upload new"}
        </p>
        <p className="mt-0.5 text-[10px] text-white/40">PNG · JPG · WebP · SVG</p>
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

      <div className="mt-3 flex gap-2">
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
              ? "Remove uploaded logo and restore the built-in default"
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
