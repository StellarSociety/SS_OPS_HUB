"use client";

import { motion } from "framer-motion";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { selectVenue } from "@/lib/actions/venue";
import { selectMobileVenue } from "@/lib/actions/mobile-venue";
import { cn } from "@/lib/utils";
import type { Venue } from "@/lib/types/database";
import {
  MOBILE_PRESS_SCALE,
  MOBILE_PRESS_TRANSITION,
  useMobilePress,
} from "@/components/mobile/mobile-press";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";

type VenueTileProps = {
  venue: Venue;
  disabled?: boolean;
  preview?: boolean;
  onSelectVenue?: (venue: Venue) => void;
  runtime?: "web" | "mobile";
  compact?: boolean;
};

export function VenueTile({
  venue,
  disabled = false,
  preview = false,
  onSelectVenue,
  runtime = "web",
  compact = false,
}: VenueTileProps) {
  const { beginNav } = useMobileNavBusy();
  const { pressed, pressProps } = useMobilePress();
  const intense = compact || runtime === "mobile";
  const handleSelect = async () => {
    if (disabled) return;
    if (compact || runtime === "mobile" || preview) beginNav();
    if (preview) {
      onSelectVenue?.(venue);
      return;
    }
    if (runtime === "mobile") {
      await selectMobileVenue(venue.slug);
      return;
    }
    await selectVenue(venue.slug);
  };

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={handleSelect}
      className={cn(
        "group flex flex-col items-center disabled:cursor-not-allowed disabled:opacity-40",
        compact ? "gap-2" : "gap-3",
      )}
      whileHover={disabled || intense ? undefined : { scale: 1.06, y: -6 }}
      whileTap={disabled || intense ? undefined : { scale: 0.98 }}
      animate={intense && !disabled ? { scale: pressed ? MOBILE_PRESS_SCALE : 1 } : undefined}
      transition={
        intense
          ? MOBILE_PRESS_TRANSITION
          : { type: "spring", stiffness: 320, damping: 22 }
      }
      {...(intense && !disabled ? pressProps : {})}
    >
      <motion.div
        className={cn(
          "relative overflow-hidden rounded-full border border-white/70 bg-white/30 shadow-[0_12px_40px_rgba(61,66,31,0.12)] backdrop-blur-xl",
          compact ? "h-20 w-20" : "h-28 w-28",
        )}
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
      <span
        className={cn(
          "font-serif text-[#3D421F]",
          compact ? "text-sm" : "text-lg",
        )}
      >
        {venue.name}
      </span>
    </motion.button>
  );
}
