"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  removeGroupAppIcon,
  updateGroupAppName,
  uploadGroupAppIcon,
} from "@/lib/actions/group-branding";
import {
  APP_NAME_MAX_LENGTH,
  DEFAULT_APP_ICON_URL,
  DEFAULT_APP_NAME,
  type GroupAppIconState,
} from "@/lib/group/branding";
import { cn } from "@/lib/utils";

const lightOutlineButtonClass =
  "border-black/15 bg-white text-[#3D421F] hover:bg-black/5 hover:text-[#3D421F]";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

type AppIconPanelProps = {
  initial: GroupAppIconState;
};

export function AppIconPanel({ initial }: AppIconPanelProps) {
  const [appIconUrl, setAppIconUrl] = useState(initial.appIconUrl);
  const [storedUrl, setStoredUrl] = useState(initial.storedAppIconUrl);
  const [savedAppName, setSavedAppName] = useState(
    initial.appName || DEFAULT_APP_NAME,
  );
  const [appName, setAppName] = useState(initial.appName || DEFAULT_APP_NAME);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const canClear = Boolean(storedUrl);
  const previewName = appName.trim() || DEFAULT_APP_NAME;
  const nameDirty = appName.trim() !== savedAppName.trim();

  function handleFile(file: File) {
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadGroupAppIcon(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.appIconUrl) {
        setAppIconUrl(result.appIconUrl);
        setStoredUrl(result.appIconUrl);
      }
      toast.uploaded(result.success ?? "App icon uploaded.");
    });
  }

  function handleSaveName() {
    if (!nameDirty || isPending) return;
    startTransition(async () => {
      const result = await updateGroupAppName(appName);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const nextName = result.appName ?? DEFAULT_APP_NAME;
      setAppName(nextName);
      setSavedAppName(nextName);
      toast.saved(result.success ?? "App name saved.");
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeGroupAppIcon();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setAppIconUrl(DEFAULT_APP_ICON_URL);
      setStoredUrl(null);
      toast.saved(result.success ?? "Default app icon restored.");
    });
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex min-h-[7.5rem] flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-[#3D421F]">App icon</h2>
          <p className="mt-1 text-sm text-black/60">
            Home Screen icon and name. This is not the group logo. Upload a
            square image, or clear to restore the default.
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
            ? "border-[var(--venue-primary)] bg-[var(--venue-primary)]/15"
            : "border-black/20 bg-[#E9E3D6] hover:border-[var(--venue-primary)]/50",
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
        <div className="flex h-[88px] w-full flex-col items-center justify-center">
          {appIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appIconUrl}
              alt={`${previewName} app icon`}
              className="size-[64px] rounded-[14px] object-cover shadow-[0_8px_20px_rgba(0,0,0,0.18)] ring-1 ring-black/10"
            />
          ) : (
            <div className="flex size-[64px] items-center justify-center rounded-[14px] bg-white/70 ring-1 ring-black/10">
              <ImageIcon className="h-7 w-7 text-black/25" />
            </div>
          )}
          <span className="mt-1.5 max-w-[7.5rem] truncate text-center text-[11px] font-medium tracking-tight text-[#3D421F]">
            {previewName}
          </span>
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

      <div className="mt-3">
        <Label htmlFor="group-app-name">App name</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="group-app-name"
            value={appName}
            maxLength={APP_NAME_MAX_LENGTH}
            placeholder={DEFAULT_APP_NAME}
            disabled={isPending}
            className="h-9 border-black/10 bg-white text-[#3D421F] placeholder:text-black/40 focus-visible:ring-[var(--venue-primary)] focus-visible:ring-offset-0"
            onChange={(event) => setAppName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSaveName();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            disabled={isPending || !nameDirty}
            onClick={handleSaveName}
          >
            Save
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-black/45">
          Used on the install page and under the Home Screen icon.{" "}
          {APP_NAME_MAX_LENGTH} characters max.
        </p>
      </div>

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
              ? "Remove uploaded icon and restore the built-in default"
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
