"use client";

import Image from "next/image";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Settings, User } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { getUserInitials } from "@/lib/user/display";
import { Button } from "@/components/ui/button";
import {
  applyInterfaceZoom,
  DEFAULT_UI_ZOOM,
  MAX_UI_ZOOM,
  MIN_UI_ZOOM,
  persistUiZoom,
  readStoredUiZoom,
  UI_ZOOM_STEP,
  uiZoomStorageKey,
} from "@/lib/ui/interface-zoom";
import { cn } from "@/lib/utils";

export type ShellUser = {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  roleLabel: string;
};

type UserProfileMenuProps = {
  user: ShellUser;
};

export function UserProfileMenu({ user }: UserProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_UI_ZOOM);
  const panelRef = useRef<HTMLDivElement>(null);
  const initials = getUserInitials(user.fullName, user.email);
  const displayName = user.fullName?.trim() || user.email;
  const zoomStorageKey = uiZoomStorageKey(user.email);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onPointerDown);
      return () => document.removeEventListener("mousedown", onPointerDown);
    }
  }, [open]);

  useEffect(() => {
    const savedZoom = readStoredUiZoom(zoomStorageKey);
    applyInterfaceZoom(savedZoom);
    const frame = window.requestAnimationFrame(() => setZoom(savedZoom));

    return () => window.cancelAnimationFrame(frame);
  }, [zoomStorageKey]);

  function changeZoom(nextZoom: number) {
    const boundedZoom = Math.min(
      MAX_UI_ZOOM,
      Math.max(MIN_UI_ZOOM, nextZoom),
    );
    setZoom(boundedZoom);
    applyInterfaceZoom(boundedZoom);
    persistUiZoom(zoomStorageKey, boundedZoom);
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D421F]/30 focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open profile menu"
      >
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={displayName}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full border border-white/80 object-cover shadow-sm"
            unoptimized
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-[#3D421F] text-sm font-medium text-white shadow-sm">
            {initials}
          </div>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-black/10 bg-white py-2 shadow-lg"
        >
          <div className="px-4 py-2">
            <p className="truncate font-medium text-[#3D421F]">{displayName}</p>
            <p className="truncate text-sm text-black/50">{user.email}</p>
            <p className="mt-1 text-xs text-black/40">{user.roleLabel}</p>
          </div>

          <div className="my-1 border-t border-black/5" />

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-black/70 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
          >
            <User className="h-4 w-4" />
            Profile
          </Link>
          <Link
            href="/profile/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-black/70 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
          >
            <Settings className="h-4 w-4" />
            Profile settings
          </Link>

          <div className="my-1 border-t border-black/5" />

          <div
            role="group"
            aria-label="Interface zoom"
            className="flex items-center justify-between gap-3 px-4 py-2"
          >
            <span className="text-sm text-black/70">Zoom</span>
            <div className="flex items-center rounded-md border border-black/10">
              <button
                type="button"
                onClick={() => changeZoom(zoom - UI_ZOOM_STEP)}
                disabled={zoom <= MIN_UI_ZOOM}
                aria-label="Zoom out"
                className="flex h-8 w-8 items-center justify-center rounded-l-md text-black/60 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span
                className="w-12 border-x border-black/10 text-center text-xs tabular-nums text-black/60"
                aria-live="polite"
              >
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => changeZoom(zoom + UI_ZOOM_STEP)}
                disabled={zoom >= MAX_UI_ZOOM}
                aria-label="Zoom in"
                className="flex h-8 w-8 items-center justify-center rounded-r-md text-black/60 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>

          <div className="my-1 border-t border-black/5" />

          <form action={signOut} className="px-2">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className={cn(
                "h-9 w-full justify-start px-2 text-sm text-black/70 hover:text-[#3D421F]",
              )}
            >
              Sign out
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
