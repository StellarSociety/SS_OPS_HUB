export const SENTIMENT_LABELS = [
  "positive",
  "neutral",
  "mixed",
  "negative",
] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export type ReviewSentiment = {
  label: SentimentLabel;
  score: number;
  topics: string[];
};

const RATING_BASE: Record<number, number> = {
  1: 12,
  2: 28,
  3: 50,
  4: 78,
  5: 92,
};

const TOPICS: Array<{ id: string; pattern: RegExp }> = [
  { id: "food", pattern: /\b(food|dish|dishes|meal|mains?|dessert|steak|bass|mezze|kitchen|flavour|flavor|tasty|delicious|bland|cold|lukewarm|raw|burnt)\b/i },
  { id: "drinks", pattern: /\b(drink|drinks|cocktail|wine|coffee|bar)\b/i },
  { id: "service", pattern: /\b(service|server|waiter|waitress|staff|attentive|rude|rushed|friendly|host)\b/i },
  { id: "wait", pattern: /\b(wait|waited|waiting|slow|delay|minutes)\b/i },
  { id: "value", pattern: /\b(price|priced|expensive|overpriced|value|worth|bill)\b/i },
  { id: "atmosphere", pattern: /\b(atmosphere|terrace|view|sunset|ambience|ambiance|noisy|quiet|beautiful)\b/i },
  { id: "cleanliness", pattern: /\b(clean|dirty|hygiene|sticky|table)\b/i },
];

const POSITIVE =
  /\b(amazing|excellent|delicious|wonderful|fantastic|perfect|attentive|generous|beautiful|recommend|lovely|great|outstanding|superb|warm welcome|will (?:be )?back)\b/gi;
const NEGATIVE =
  /\b(rude|cold|lukewarm|overpriced|slow|waited|dirty|bland|disappointing|terrible|awful|never again|raw|burnt|rushed|ignored|inedible|mediocre)\b/gi;

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreReview(input: {
  rating: number | null | undefined;
  comment: string | null | undefined;
}): ReviewSentiment {
  const rating =
    typeof input.rating === "number" && input.rating >= 1 && input.rating <= 5
      ? input.rating
      : null;
  const comment = input.comment?.trim() ?? "";
  const posHits = comment ? countMatches(comment, POSITIVE) : 0;
  const negHits = comment ? countMatches(comment, NEGATIVE) : 0;

  let score = rating != null ? RATING_BASE[rating] ?? 50 : comment ? 50 : 50;
  score = clamp(score + posHits * 6 - negHits * 8);

  const topics = TOPICS.filter((topic) => topic.pattern.test(comment)).map(
    (topic) => topic.id,
  );

  let label: SentimentLabel;
  if (posHits > 0 && negHits > 0) {
    label = "mixed";
  } else if (rating != null && rating <= 2) {
    label = negHits > 0 || posHits === 0 ? "negative" : "mixed";
  } else if (rating != null && rating >= 4 && negHits === 0) {
    label = "positive";
  } else if (score <= 38) {
    label = "negative";
  } else if (score >= 68) {
    label = "positive";
  } else if (negHits > 0) {
    label = "mixed";
  } else {
    label = "neutral";
  }

  return { label, score, topics };
}
