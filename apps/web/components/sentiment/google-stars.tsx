import { cn } from "@/lib/utils";

export function GoogleStars({
  rating,
  className,
  size = "md",
}: {
  rating: number | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const value = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
  const px = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={cn("inline-flex items-center gap-px", className)}
      aria-label={`${value} of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          className={px}
          aria-hidden
        >
          <path
            d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
            fill={index < value ? "#FABB05" : "#E0E0E0"}
          />
        </svg>
      ))}
    </span>
  );
}
