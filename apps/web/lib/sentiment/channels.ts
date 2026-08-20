import type { SentimentChannel } from "./types";

export const SENTIMENT_CHANNEL_META: Record<
  SentimentChannel,
  { label: string; href: string; description: string }
> = {
  google: {
    label: "Google",
    href: "/sentiment/reviews/google",
    description: "Google Business Profile reviews.",
  },
  tripadvisor: {
    label: "TripAdvisor",
    href: "/sentiment/reviews/tripadvisor",
    description: "TripAdvisor guest reviews.",
  },
};

export function isSentimentChannel(value: string): value is SentimentChannel {
  return value === "google" || value === "tripadvisor";
}
