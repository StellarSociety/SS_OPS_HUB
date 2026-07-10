import type { CSSProperties } from "react";
import type { Venue } from "@/lib/types/database";

export function venueThemeStyle(venue: Venue | null): CSSProperties {
  if (!venue) return {};
  return {
    ["--venue-primary" as string]: venue.primary_color,
    ["--venue-secondary" as string]: venue.secondary_color,
  };
}
