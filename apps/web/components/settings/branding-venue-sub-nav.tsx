"use client";

import Link from "next/link";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { cn } from "@/lib/utils";
import type { Venue } from "@/lib/types/database";

type BrandingVenueSubNavProps = {
  venues: Venue[];
};

export function BrandingVenueSubNav({ venues }: BrandingVenueSubNavProps) {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Venue branding"
      className="flex w-full flex-wrap gap-2 overflow-x-auto rounded-lg border border-black/10 bg-white/60 p-2 backdrop-blur-md"
    >
      {venues.map((venue) => {
        const href = `/global/settings/branding/${venue.slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={venue.id}
            href={href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
                : "text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
            )}
          >
            {venue.name}
          </Link>
        );
      })}
    </nav>
  );
}
