"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { selectVenue } from "@/lib/actions/venue";
import type { Venue } from "@/lib/types/database";

type VenueTileProps = {
  venue: Venue;
  disabled?: boolean;
};

function OrillaPlaceholder() {
  return (
    <svg viewBox="0 0 80 80" className="h-full w-full" aria-hidden>
      <circle cx="40" cy="40" r="38" fill="#808A3E" />
      <path
        d="M24 48c8-14 24-14 32 0"
        stroke="#F0F3DD"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
        {venue.is_global ? (
          <div className="flex h-full w-full items-center justify-center bg-[#3D421F]/10">
            <Globe className="h-10 w-10 text-[#3D421F]/70" strokeWidth={1.5} />
          </div>
        ) : venue.logo_url ? (
          <Image
            src={venue.logo_url}
            alt={`${venue.name} logo`}
            fill
            className="object-cover"
            sizes="96px"
          />
        ) : venue.slug === "orilla" ? (
          <OrillaPlaceholder />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-serif text-2xl text-white"
            style={{ backgroundColor: venue.primary_color }}
          >
            {venue.name.charAt(0)}
          </div>
        )}
      </motion.div>
      <span className="font-serif text-lg text-[#3D421F]">{venue.name}</span>
    </motion.button>
  );
}
