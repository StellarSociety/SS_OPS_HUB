"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const STAR_PATH =
  "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

const STAR_SIZE = {
  md: "h-6 w-6",
  lg: "h-8 w-8",
} as const;

export function AnimatedRatingStars({
  rating,
  className,
  size = "lg",
}: {
  rating: number | null;
  className?: string;
  size?: keyof typeof STAR_SIZE;
}) {
  const uid = useId().replace(/:/g, "");
  const goldId = `rating-gold-${uid}`;
  const clamped = Math.max(0, Math.min(5, rating ?? 0));
  const display = Math.round(clamped * 10) / 10;
  const starClass = STAR_SIZE[size];

  return (
    <span
      className={cn(
        "rating-stars-stage relative inline-flex items-center gap-1",
        className,
      )}
      aria-label={`${display} of 5 stars`}
    >
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={goldId} x1="12" y1="2" x2="12" y2="21">
            <stop offset="0%" stopColor="#FFD23A" />
            <stop offset="45%" stopColor="#F5B400" />
            <stop offset="100%" stopColor="#E09200" />
          </linearGradient>
        </defs>
      </svg>

      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, clamped - index));
        return (
          <span key={index} className={cn("relative block shrink-0", starClass)}>
            <svg viewBox="0 0 24 24" className={cn("block", starClass)} aria-hidden>
              <path d={STAR_PATH} fill="#E6E6E6" />
            </svg>
            {fill > 0 ? (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <svg viewBox="0 0 24 24" className={cn("block", starClass)} aria-hidden>
                  <path d={STAR_PATH} fill={`url(#${goldId})`} />
                </svg>
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
