import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Guest silhouette with a sparkle — reads at Apps Hub size. */
export const GuestsIntel = forwardRef<SVGSVGElement, LucideProps>(
  function GuestsIntel(
    {
      className,
      color,
      size = 24,
      strokeWidth = 1.5,
      absoluteStrokeWidth,
      ...props
    },
    ref,
  ) {
    const sw =
      typeof strokeWidth === "number"
        ? absoluteStrokeWidth
          ? (Number(size) / 24) * strokeWidth
          : strokeWidth
        : 1.5;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color ?? "currentColor"}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("block", className)}
        aria-hidden
        {...props}
      >
        <circle cx="10" cy="8" r="3.2" />
        <path d="M3.6 20c.4-3.2 3-5.2 6.4-5.2s6 2 6.4 5.2" />
        <path d="M18.2 4.2 18.7 5.6 20.1 6.1 18.7 6.6 18.2 8 17.7 6.6 16.3 6.1 17.7 5.6z" />
        <path d="M20.6 9.4v1.6M19.8 10.2h1.6" />
      </svg>
    );
  },
);
