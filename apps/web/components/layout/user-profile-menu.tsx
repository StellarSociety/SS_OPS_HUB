"use client";

import Image from "next/image";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useEffect, useRef, useState } from "react";
import { Settings, User } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { getUserInitials } from "@/lib/user/display";
import { Button } from "@/components/ui/button";
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
  const panelRef = useRef<HTMLDivElement>(null);
  const initials = getUserInitials(user.fullName, user.email);
  const displayName = user.fullName?.trim() || user.email;

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
            width={36}
            height={36}
            className="h-9 w-9 rounded-full border border-white/80 object-cover shadow-sm"
            unoptimized
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-[#3D421F] text-sm font-medium text-white shadow-sm">
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
