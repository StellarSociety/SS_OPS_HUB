import { cn } from "@/lib/utils";

const STAR_PATH =
  "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

const SIZE_CLASS = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
} as const;

function StarGlyph({
  className,
  fill,
}: {
  className?: string;
  fill: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={STAR_PATH} fill={fill} />
    </svg>
  );
}

export function GoogleStars({
  rating,
  className,
  size = "md",
  animate = false,
}: {
  rating: number | null;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(5, rating ?? 0));
  const display = Math.round(clamped * 10) / 10;
  const px = SIZE_CLASS[size];

  return (
    <span
      className={cn(
        "inline-flex items-center",
        size === "lg" || size === "xl" ? "gap-1" : "gap-px",
        className,
      )}
      aria-label={`${display} of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, clamped - index));
        const delay = `${index * 110}ms`;
        return (
          <span
            key={index}
            className={cn(
              "relative block shrink-0",
              px,
              animate && "rating-star-animate",
            )}
            style={animate ? { animationDelay: delay } : undefined}
          >
            <StarGlyph className={cn("block", px)} fill="#E0E0E0" />
            {fill > 0 ? (
              <span
                className={cn(
                  "absolute inset-y-0 left-0 overflow-hidden",
                  animate && "rating-star-fill",
                )}
                style={{
                  width: `${fill * 100}%`,
                  animationDelay: animate ? `${index * 110 + 90}ms` : undefined,
                }}
              >
                <StarGlyph className={cn("block", px)} fill="#FABB05" />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
