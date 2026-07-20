"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { updateUserAvatar } from "@/lib/actions/users";
import { getUserInitials } from "@/lib/user/display";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type UserAvatarFieldProps = {
  userId: string;
  avatarUrl: string | null;
  fullName: string | null;
  email: string;
  className?: string;
};

export function UserAvatarField({
  userId,
  avatarUrl,
  fullName,
  email,
  className,
}: UserAvatarFieldProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(avatarUrl);
  const [isPending, startTransition] = useTransition();
  const initials = getUserInitials(fullName, email);
  const displayName = fullName?.trim() || email;

  useEffect(() => {
    setPreview(avatarUrl);
  }, [avatarUrl]);

  function upload(file: File | null, clear = false) {
    if (!clear && (!file || file.size === 0)) return;

    const formData = new FormData();
    if (clear) {
      formData.set("avatar_clear", "1");
    } else if (file) {
      formData.set("avatar", file);
    }

    startTransition(async () => {
      const result = await updateUserAvatar(userId, formData);
      if (result.error) {
        toast.error(result.error);
        setPreview(avatarUrl);
        return;
      }
      toast.saved(result.success ?? "Profile photo updated.");
      setPreview(result.avatarUrl ?? null);
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-black/10 bg-black/[0.04] shadow-sm">
        {preview ? (
          <Image
            src={preview}
            alt={displayName}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#3D421F] text-xl font-medium text-white">
            {initials}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-xs text-black/50">Profile photo</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className="border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {preview ? "Replace" : "Upload"}
          </Button>
          {preview ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => upload(null, true)}
              className="text-black/55 hover:bg-black/5"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
        <p className="max-w-xs text-[11px] leading-snug text-black/40">
          Square headshot works best. PNG, JPEG, or WebP up to 512 KB.
        </p>
        {!preview ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-black/35">
            <ImagePlus className="h-3 w-3" aria-hidden />
            Shown in the app header and profile.
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={isPending}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (file) {
              const objectUrl = URL.createObjectURL(file);
              setPreview(objectUrl);
              upload(file);
            }
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
