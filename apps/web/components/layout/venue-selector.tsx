"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Repeat2 } from "lucide-react";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { selectVenue } from "@/lib/actions/venue";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type VenueSelectorProps = {
  venues: Venue[];
  activeVenue: Venue;
  collapsed?: boolean;
};

function VenueOptionIcon({ venue }: { venue: Venue }) {
  return (
    <VenueBrandIcon
      slug={venue.slug}
      name={venue.name}
      isGlobal={venue.is_global}
      primaryColor={venue.primary_color}
      logoUrl={venue.logo_url}
      iconUrl={venue.icon_url}
      faviconUrl={venue.favicon_url}
      variant="badge"
      className="h-6 w-6 shrink-0"
    />
  );
}

export function VenueSelector({
  venues,
  activeVenue,
  collapsed = false,
}: VenueSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

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

  function handleSelect(slug: string) {
    if (slug === activeVenue.slug || pending) return;
    setOpen(false);
    startTransition(async () => {
      await selectVenue(slug);
    });
  }

  return (
    <div ref={panelRef} className="relative mb-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        title={collapsed ? activeVenue.name : undefined}
        aria-label={collapsed ? `Venue: ${activeVenue.name}` : undefined}
        className={cn(
          "flex w-full items-center rounded-lg border border-black/5 bg-white/60 text-left text-sm transition-colors hover:bg-white/80",
          collapsed ? "justify-center px-2 py-2" : "gap-2 px-2.5 py-2",
          pending && "opacity-60",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <VenueOptionIcon venue={activeVenue} />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate font-medium text-[#3D421F]">
              {activeVenue.name}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-black/40 transition-transform",
                open && "rotate-180",
              )}
            />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          role="listbox"
          className={cn(
            "absolute z-50 max-h-56 overflow-y-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg",
            collapsed
              ? "left-full top-0 ml-1 w-48"
              : "left-0 right-0 top-full mt-1",
          )}
        >
          {venues.map((venue) => {
            const selected = venue.id === activeVenue.id;
            return (
              <button
                key={venue.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(venue.slug)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5",
                  selected && "bg-[var(--venue-primary)]/10",
                )}
              >
                <VenueOptionIcon venue={venue} />
                <span className="min-w-0 flex-1 truncate text-[#3D421F]">
                  {venue.name}
                </span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0 text-[#3D421F]" />
                ) : null}
              </button>
            );
          })}
          <div className="my-1 border-t border-black/8" />
          <Link
            href="/select-venue"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm text-black/60 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
          >
            <Repeat2 className="h-4 w-4 shrink-0" />
            Switch venue
          </Link>
        </div>
      ) : null}
    </div>
  );
}
