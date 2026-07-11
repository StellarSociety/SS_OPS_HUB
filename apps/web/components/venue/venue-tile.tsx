"use client";

import { motion } from "framer-motion";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { selectVenue } from "@/lib/actions/venue";
import type { Venue } from "@/lib/types/database";

type VenueTileProps = {
  venue: Venue;
  disabled?: boolean;
};

export function VenueTile({ venue, disabled = false }: VenueTileProps) {
  const handleSelect = async () => {
    if (disabled) return;
    await selectVenue(venue.slug);
  };

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={handleSelect}
      className="group flex flex-col items-center gap-3 disabled:cursor-not-allowed disabled:opacity-40"
      whileHover={disabled ? undefined : { scale: 1.06, y: -6 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
    >
      <motion.div
        className="relative h-24 w-24 overflow-hidden rounded-full border border-white/70 bg-white/30 shadow-[0_12px_40px_rgba(61,66,31,0.12)] backdrop-blur-xl"
        whileHover={disabled ? undefined : { boxShadow: "0 20px 50px rgba(61,66,31,0.18)" }}
      >
        <VenueBrandIcon
          slug={venue.slug}
          name={venue.name}
          isGlobal={venue.is_global}
          primaryColor={venue.primary_color}
          logoUrl={venue.logo_url}
          iconUrl={venue.icon_url}
          faviconUrl={venue.favicon_url}
          variant="badge"
          className="h-full w-full"
          title={`${venue.name} logo`}
        />
      </motion.div>
      <span className="font-serif text-lg text-[#3D421F]">{venue.name}</span>
    </motion.button>
  );
}
