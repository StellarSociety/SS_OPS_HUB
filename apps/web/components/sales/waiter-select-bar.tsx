"use client";

import type { VenueWaiter } from "@/lib/sales/waiters-types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type WaiterSelectBarProps = {
  waiters: VenueWaiter[];
  selectedWaiterId: string;
  onSelect: (waiterId: string) => void;
};

export function WaiterSelectBar({
  waiters,
  selectedWaiterId,
  onSelect,
}: WaiterSelectBarProps) {
  return (
    <Card className="p-3">
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-black/50">
          Select waiter
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {waiters.map((waiter) => {
            const active = waiter.id === selectedWaiterId;
            return (
              <button
                key={waiter.id}
                type="button"
                onClick={() => onSelect(waiter.id)}
                className={cn(
                  "flex shrink-0 flex-col items-center justify-center rounded-md border px-3 py-1.5 text-center transition-colors",
                  active
                    ? "border-[var(--venue-primary)] bg-[var(--venue-primary)] text-white"
                    : "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30",
                )}
              >
                <span className="text-sm font-medium">{waiter.name}</span>
                {waiter.position ? (
                  <span
                    className={cn(
                      "text-xs",
                      active ? "text-white/80" : "text-black/50",
                    )}
                  >
                    {waiter.position}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
