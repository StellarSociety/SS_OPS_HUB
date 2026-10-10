"use client";

import { useId } from "react";
import { useVenue } from "@/components/providers/venue-provider";
import { getVenueBadgeUrl } from "@/lib/venue/branding";

/** Pattern tweaks: tilt (degrees, negative = left), size and colour strength. */
const PATTERN_ANGLE = -45;
const PATTERN_SCALE = 0.62;
const LINE_COLOR = "#8b8d7d"; // muted olive-grey (low saturation)

/** Venues with their own wallpaper image (by slug); others use the drawn pattern. */
const VENUE_WALLPAPERS: Record<string, string> = {
  orilla: "/venues/orilla-chat-pattern.webp",
};

/**
 * Fixed chat wallpaper: the venue's own image when it has one, otherwise chat
 * bubbles plus the venue favicon on one repeating, tilted tile. Sits behind the scrolling messages and does not move with them.
 */
export function ChatBackdrop() {
  const { venue } = useVenue();
  const badge = venue ? getVenueBadgeUrl(venue) : null;
  const patternId = `chat-pattern-${useId().replace(/:/g, "")}`;
  const wallpaper = venue?.slug ? VENUE_WALLPAPERS[venue.slug] : undefined;

  if (wallpaper) {
    return (
      <div
        aria-hidden
        className="chat-wallpaper pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${wallpaper})` }}
      />
    );
  }

  return (
    <div aria-hidden className="chat-wallpaper pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <pattern
            id={patternId}
            width="180"
            height="180"
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${PATTERN_ANGLE}) scale(${PATTERN_SCALE})`}
          >
            <g
              fill="none"
              stroke={LINE_COLOR}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.22"
            >
              <path d="M22 14h34a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H32l-9 7v-7h-1a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" />
              <path d="M120 20h36a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-2v7l-9-7h-25a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8z" />
              <circle cx="128" cy="33" r="1.6" />
              <circle cx="138" cy="33" r="1.6" />
              <circle cx="148" cy="33" r="1.6" />
              <path d="M88 96c14 0 24 7 24 16s-10 16-24 16c-3 0-6 0-8-1l-10 5 3-8c-6-3-9-7-9-12 0-9 10-16 24-16z" />
              <path d="M136 128h26a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-16l-8 6v-6h-2a6 6 0 0 1-6-6v-12a6 6 0 0 1 6-6z" />
              <path d="M142 137h14M142 143h9" />
            </g>
            {badge ? (
              <g opacity="0.12" style={{ filter: "saturate(0.2)" }}>
                <image href={badge} x="80" y="34" width="26" height="26" preserveAspectRatio="xMidYMid meet" />
                <image href={badge} x="24" y="118" width="30" height="30" preserveAspectRatio="xMidYMid meet" />
              </g>
            ) : null}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
