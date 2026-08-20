"use client";

import { cn } from "@/lib/utils";

export function LiquidGlassScrim({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.42)_0%,rgba(240,243,221,0.38)_50%,rgba(61,66,31,0.18)_100%)] backdrop-blur-[40px] backdrop-saturate-150"
      />
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
    </>
  );
}

export function LiquidGlassPanel({
  children,
  className,
  labelledBy,
}: {
  children: React.ReactNode;
  className?: string;
  labelledBy: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={cn(
        "relative z-10 overflow-hidden border border-white/55 bg-white/45 shadow-[0_12px_50px_rgba(61,66,31,0.22),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-150",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/55 to-transparent"
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
