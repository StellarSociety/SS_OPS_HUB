import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Stellar Society vault mark (filled), cropped from the brand SVG. */
export const VaultSafe = forwardRef<SVGSVGElement, LucideProps>(function VaultSafe(
  { className, color, size = 24, strokeWidth, absoluteStrokeWidth, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-24 -26 348 348"
      fill="currentColor"
      stroke="none"
      className={cn("block", className)}
      aria-hidden
      {...props}
    >
      <path d="M244.2 293h-28.4c-11 0-19.9-8.9-19.9-19.9v-11.7c0-1.6-1.3-2.8-2.8-2.8h-85.3c-1.6 0-2.8 1.3-2.8 2.8v11.7c0 11-8.9 19.9-19.9 19.9H56.5c-11 0-19.9-8.9-19.9-19.9v-15.4c-17.9-3.9-31.3-19.9-31.3-38.9v-176C5.4 20.9 23.2 3 45.2 3h210.4c21.9 0 39.8 17.9 39.8 39.8v176c0 19-13.4 35-31.3 38.9v15.4c0 11-8.9 19.9-19.9 19.9zM107.7 241.5H193c11 0 19.9 8.9 19.9 19.9v11.7c0 1.6 1.3 2.8 2.8 2.8h28.4c1.6 0 2.8-1.3 2.8-2.8v-23c0-4.7 3.8-8.5 8.5-8.5 12.5 0 22.7-10.2 22.7-22.7v-176c0-12.5-10.2-22.7-22.7-22.7H45.2c-12.5 0-22.7 10.2-22.7 22.7v176c0 12.5 10.2 22.7 22.7 22.7 4.7 0 8.5 3.8 8.5 8.5v23c0 1.6 1.3 2.8 2.8 2.8H85c1.6 0 2.8-1.3 2.8-2.8v-11.7c0-11 8.9-19.9 19.9-19.9z" />
      <path d="M176.8 118c-1.4-4.5-6.3-6.9-10.7-5.5l-33.6 10.8v-35c0-4.7-3.8-8.5-8.5-8.5s-8.5 3.8-8.5 8.5v35l-33.5-10.8c-4.5-1.5-9.3 1-10.7 5.5-1.4 4.5 1 9.3 5.5 10.7l33.5 10.8-20.8 28.6c-2.8 3.8-1.9 9.2 1.9 11.9 1.5 1.1 3.3 1.6 5 1.6 2.6 0 5.2-1.2 6.9-3.5l20.8-28.6 20.8 28.6c1.7 2.3 4.3 3.5 6.9 3.5 1.7 0 3.5-0.5 5-1.6 3.8-2.8 4.6-8.1 1.9-11.9l-20.7-28.5 33.5-10.8c4.5-1.5 7-6.3 5.6-10.8z" />
      <path d="M221.4 181.5c-4.7 0-8.5-3.8-8.5-8.5V88.5c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5V173c0 4.7-3.8 8.5-8.5 8.5z" />
    </svg>
  );
});
