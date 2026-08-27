export const LIVE_DISPLAY_FEATURE = "live_display" as const;

export type LiveDisplaySettings = {
  venue_id: string;
  public_code: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type LiveDisplayListingStats = {
  rating: number | null;
  reviewCount: number;
};

export type LiveDisplayChannelCard = {
  key: "google" | "tripadvisor";
  label: string;
  cta: string;
  rating: number | null;
  reviewCount: number;
  qrSvg: string | null;
};

export type LiveDisplayView = {
  venueName: string;
  venueTagline: string | null;
  venueLogoUrl: string | null;
  updatedLabel: string;
  google: LiveDisplayListingStats;
  tripadvisor: LiveDisplayListingStats;
  channels: LiveDisplayChannelCard[];
  thisMonth: LiveDisplayListingStats;
  overall: LiveDisplayListingStats;
  guestsLove: string[];
};

export function liveDisplayPath(code: string): string {
  return `/live/${encodeURIComponent(code.trim().toLowerCase())}`;
}
