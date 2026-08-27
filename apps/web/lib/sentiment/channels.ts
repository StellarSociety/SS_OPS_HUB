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
  guest: {
    label: "Guest",
    href: "/sentiment/reviews/guest",
    description: "Reviews collected from the Guest Feedback page.",
  },
};

export function isSentimentChannel(value: string): value is SentimentChannel {
  return value === "google" || value === "tripadvisor" || value === "guest";
}

export function sentimentChannelLabel(channel: SentimentChannel): string {
  return SENTIMENT_CHANNEL_META[channel].label;
}

export function sentimentGuestFallbackName(channel: SentimentChannel): string {
  if (channel === "guest") return "Guest";
  if (channel === "tripadvisor") return "TripAdvisor user";
  return "Google user";
}
