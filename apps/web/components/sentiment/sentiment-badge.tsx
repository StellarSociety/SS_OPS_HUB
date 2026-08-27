import type { SentimentLabel } from "@/lib/sentiment/score-review";

export function SentimentBadge({
  label,
  score,
}: {
  label: SentimentLabel | null;
  score: number | null;
}) {
  if (!label) return null;
  const styles =
    label === "positive"
      ? "bg-emerald-50 text-emerald-800"
      : label === "negative"
        ? "bg-red-50 text-red-800"
        : label === "mixed"
          ? "bg-amber-50 text-amber-900"
          : "bg-black/[0.04] text-black/55";
  const text =
    label === "positive"
      ? "Positive"
      : label === "negative"
        ? "Negative"
        : label === "mixed"
          ? "Mixed"
          : "Neutral";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {text}
      {typeof score === "number" ? ` · ${score}` : ""}
    </span>
  );
}
