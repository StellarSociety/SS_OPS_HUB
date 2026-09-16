"use client";

import { motion } from "framer-motion";
import { VenueTile } from "@/components/venue/venue-tile";
import { cn } from "@/lib/utils";
import type { Venue } from "@/lib/types/database";

type VenueGridProps = {
  venues: Venue[];
  preview?: boolean;
  onSelectVenue?: (venue: Venue) => void;
  runtime?: "web" | "mobile";
};

export function VenueGrid({
  venues,
  preview = false,
  onSelectVenue,
  runtime = "web",
}: VenueGridProps) {
  const compact = preview || runtime === "mobile";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative z-10 w-full max-w-3xl text-center"
    >
      <h1
        className={cn(
          "font-serif text-[#3D421F]",
          compact ? "text-2xl" : "text-4xl",
        )}
      >
        Select a venue
      </h1>
      <p
        className={cn(
          "text-[#3D421F]/60",
          compact ? "mt-1.5 text-xs" : "mt-2 text-sm",
        )}
      >
        Choose where you want to work today.
      </p>
      <div
        className={cn(
          "flex flex-wrap items-start justify-center",
          compact ? "mt-5 gap-6" : "mt-12 gap-14",
        )}
      >
        {venues.map((venue) => (
          <VenueTile
            key={venue.id}
            venue={venue}
            preview={preview}
            onSelectVenue={onSelectVenue}
            runtime={runtime}
            compact={compact}
          />
        ))}
      </div>
    </motion.div>
  );
}
