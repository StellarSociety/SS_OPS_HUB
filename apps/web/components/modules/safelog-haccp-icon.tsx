import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Clipboard log with HACCP on the page — reads at Apps Hub size. */
export const SafeLogHaccp = forwardRef<SVGSVGElement, LucideProps>(
  function SafeLogHaccp(
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
        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <text
          x="12"
          y="15.4"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontSize="5.4"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          textLength="10.2"
          lengthAdjust="spacingAndGlyphs"
        >
          HACCP
        </text>
      </svg>
    );
  },
);
