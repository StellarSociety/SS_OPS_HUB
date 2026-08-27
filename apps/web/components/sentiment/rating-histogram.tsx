import { GoogleStars } from "@/components/sentiment/google-stars";
import { ScopedLink } from "@/components/layout/scoped-link";
import { STAR_LEVELS, type StarCounts, type StarLevel } from "@/lib/sentiment/review-insights";
import { cn } from "@/lib/utils";

export function RatingHistogram({
  averageRating,
  starCounts,
  total,
  href,
  className,
  onSelectStar,
}: {
  averageRating: number | null;
  starCounts: StarCounts;
  total: number;
  href?: string;
  className?: string;
  onSelectStar?: (stars: StarLevel) => void;
}) {
  const ratedTotal = STAR_LEVELS.reduce(
    (sum, stars) => sum + starCounts[stars],
    0,
  );
  const countLabel = `${total} review${total === 1 ? "" : "s"}`;

  return (
    <div
      className={cn("flex min-w-0 items-center gap-4", className)}
      aria-label="Star rating breakdown"
    >
      <div className="grid min-w-0 flex-1 grid-cols-[0.75rem_minmax(0,1fr)_2.25rem] items-center gap-x-2 gap-y-1.5">
        {STAR_LEVELS.map((stars) => {
          const count = starCounts[stars];
          const pct = ratedTotal > 0 ? (count / ratedTotal) * 100 : 0;
          return (
            <div key={stars} className="contents">
              <span className="text-right text-xs tabular-nums text-black/55">
                {stars}
              </span>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-black/[0.08]"
                title={`${count} at ${stars} star${stars === 1 ? "" : "s"}`}
              >
                <div
                  className="h-full rounded-full bg-[#FABB05]"
                  style={{
                    width: count > 0 ? `${Math.max(pct, 3)}%` : "0%",
                  }}
                />
              </div>
              {count === 0 || !onSelectStar ? (
                <span
                  className={cn(
                    "text-right text-xs tabular-nums",
                    count === 0 ? "text-black/35" : "text-[#3D421F]",
                  )}
                >
                  {count}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectStar(stars)}
                  className="w-full text-right text-xs font-medium tabular-nums text-[var(--venue-primary,#818a40)] hover:underline"
                  aria-label={`${count} review${count === 1 ? "" : "s"} at ${stars} star${stars === 1 ? "" : "s"}`}
                >
                  {count}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-col items-center justify-center">
        <p className="font-google-sans text-4xl font-semibold tabular-nums leading-none text-[#3D421F]">
          {averageRating != null ? averageRating.toFixed(1) : "—"}
        </p>
        <GoogleStars rating={averageRating} size="md" className="mt-1" />
        {href ? (
          <ScopedLink
            href={href}
            className="mt-1.5 text-sm font-medium text-[var(--venue-primary,#818a40)] hover:underline"
          >
            {countLabel}
          </ScopedLink>
        ) : (
          <p className="mt-1.5 text-sm font-medium text-[var(--venue-primary,#818a40)]">
            {countLabel}
          </p>
        )}
      </div>
    </div>
  );
}
