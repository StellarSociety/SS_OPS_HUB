"use client";

import { motion } from "framer-motion";
import { VenueTile } from "@/components/venue/venue-tile";
import type { Venue } from "@/lib/types/database";

type VenueGridProps = {
  venues: Venue[];
};

export function VenueGrid({ venues }: VenueGridProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative z-10 w-full max-w-3xl text-center"
    >
      <h1 className="font-serif text-3xl text-[#3D421F] md:text-4xl">
        Select a venue
      </h1>
      <p className="mt-2 text-sm text-[#3D421F]/60">
        Choose where you want to work today.
      </p>
      <div className="mt-12 flex flex-wrap items-start justify-center gap-10 md:gap-14">
        {venues.map((venue) => (
          <VenueTile key={venue.id} venue={venue} />
        ))}
      </div>
    </motion.div>
  );
}
