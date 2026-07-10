"use client";

import { Menu } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { clearVenueSelection } from "@/lib/actions/venue";
import { Button } from "@/components/ui/button";
import type { Venue } from "@/lib/types/database";

type AppHeaderProps = {
  venue: Venue;
};

export function AppHeader({ venue }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-black/5 bg-white/60 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-md p-2 text-black/60 hover:bg-black/5 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 shadow-sm"
          style={{ backgroundColor: venue.primary_color }}
        >
          <span className="font-serif text-sm text-white">
            {venue.is_global ? "G" : venue.name.charAt(0)}
          </span>
        </div>
        <div>
          <p className="font-serif text-base text-[#3D421F]">{venue.name}</p>
          <p className="text-xs text-black/50">
            {venue.is_global ? "Consolidated view" : "Venue workspace"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <form action={clearVenueSelection}>
          <Button variant="ghost" size="sm" className="text-[#3D421F]" type="submit">
            Switch venue
          </Button>
        </form>
        <form action={signOut}>
          <Button variant="secondary" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
