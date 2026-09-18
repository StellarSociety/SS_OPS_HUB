import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Candidate + search glass — reads at Apps Hub size. */
export const HiringIcon = forwardRef<SVGSVGElement, LucideProps>(
  function HiringIcon(
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
        <circle cx="9" cy="7.5" r="3.1" />
        <path d="M3.4 20c.4-3.2 2.7-5.2 5.6-5.2 1.2 0 2.3.35 3.15 1" />
        <circle cx="16.4" cy="15.1" r="3.35" />
        <path d="m18.85 17.55 2.55 2.55" />
      </svg>
    );
  },
);
