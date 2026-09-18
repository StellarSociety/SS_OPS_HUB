import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Candidate beside a hiring form — two marks, no overlapping strokes,
 * so it stays readable in the compact shortcut well.
 */
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
        <circle cx="8" cy="7.6" r="3.15" />
        <path d="M3.15 20.4c.4-3.35 2.55-5.45 5.1-5.45 1.65 0 3.05.9 4.05 2.4" />
        <rect x="13.35" y="6.55" width="7.85" height="13.05" rx="1.55" />
        <rect x="15.45" y="5" width="3.65" height="2.7" rx="0.65" />
        <path d="M15.05 11.25h4.45" />
        <path d="M15.05 14h4.45" />
        <path d="M15.05 16.75h2.85" />
      </svg>
    );
  },
);
