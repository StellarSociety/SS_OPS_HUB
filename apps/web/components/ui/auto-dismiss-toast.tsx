"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

type AutoDismissToastProps = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
  className?: string;
};

export function AutoDismissToast({
  message,
  onDismiss,
  durationMs = 3200,
  className,
}: AutoDismissToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, durationMs]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-[100] max-w-sm rounded-lg border border-black/10 bg-[#3D421F] px-4 py-3 text-sm font-medium text-white shadow-lg",
        className,
      )}
    >
      {message}
    </div>
  );
}
