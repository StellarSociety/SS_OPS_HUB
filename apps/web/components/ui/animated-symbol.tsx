"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Shared hover twist for Lucide symbols across the app. */
export const animatedSymbolVariants = {
  rest: { scale: 1, y: 0, rotate: 0 },
  hover: { scale: 1.14, y: -2, rotate: 12 },
  tap: { scale: 0.94, rotate: 0 },
} as const;

export const animatedSymbolTransition = {
  type: "spring" as const,
  stiffness: 460,
  damping: 14,
};

type AnimatedSymbolProps = {
  children: React.ReactNode;
  className?: string;
  /**
   * When true (default), this wrapper owns hover/tap detection.
   * When false, a parent must drive `whileHover="hover"` / `whileTap="tap"`.
   */
  selfHover?: boolean;
};

export function AnimatedSymbol({
  children,
  className,
  selfHover = true,
}: AnimatedSymbolProps) {
  return (
    <motion.span
      className={cn("inline-flex items-center justify-center", className)}
      initial="rest"
      whileHover={selfHover ? "hover" : undefined}
      whileTap={selfHover ? "tap" : undefined}
      variants={animatedSymbolVariants}
      transition={animatedSymbolTransition}
    >
      {children}
    </motion.span>
  );
}
