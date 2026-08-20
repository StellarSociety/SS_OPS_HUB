import type { SentimentReplyTemplate, SentimentReview } from "./types";

export const DEFAULT_REPLY_TEMPLATES: { name: string; body: string; sort_order: number }[] =
  [
    {
      name: "Thank you",
      sort_order: 0,
      body: "Thank you for dining with us, {first_name}. We're delighted you enjoyed your evening and look forward to welcoming you back to {venue}.",
    },
    {
      name: "Thanks + wait",
      sort_order: 1,
      body: "Thank you for the kind words, {first_name}. We're sorry you waited for mains — we've shared this with the team so we can be quicker next time. We'd love to host you again at {venue}.",
    },
    {
      name: "Apology",
      sort_order: 2,
      body: "Thank you for taking the time to write, {first_name}. We're sorry your visit wasn't what you hoped for. Please come back and ask for the manager so we can make it right at {venue}.",
    },
    {
      name: "Short reply",
      sort_order: 3,
      body: "Thank you, {first_name} — we truly appreciate you choosing {venue}.",
    },
  ];

export function applyReplyTemplate(
  body: string,
  review: Pick<SentimentReview, "author_name" | "rating">,
  venueName: string,
): string {
  const name = review.author_name?.trim() || "there";
  const firstName = name.split(/\s+/)[0] || name;
  return body
    .replaceAll("{name}", name)
    .replaceAll("{first_name}", firstName)
    .replaceAll("{venue}", venueName)
    .replaceAll(
      "{rating}",
      review.rating != null ? String(review.rating) : "",
    );
}

export function firstNameFromReview(review: Pick<SentimentReview, "author_name">): string {
  const name = review.author_name?.trim() || "there";
  return name.split(/\s+/)[0] || name;
}

export type { SentimentReplyTemplate };
