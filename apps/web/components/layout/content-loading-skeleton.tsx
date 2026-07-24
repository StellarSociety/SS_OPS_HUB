import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--venue-primary,#818a40)]/10",
        className,
      )}
    />
  );
}

/**
 * Lightweight skeleton for the CONTENT area that sits below a section's
 * persistent header + sub-navigation. Used by segment-level `loading.tsx`
 * boundaries so switching tabs within a section keeps the sub-nav on screen and
 * only the content below it shows a placeholder — making navigation feel
 * instant instead of blanking the whole page.
 */
export function ContentLoadingSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-5 h-8 w-28" />
        </Card>
        <Card className="p-5">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-5 h-8 w-24" />
        </Card>
        <Card className="p-5">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="mt-5 h-8 w-32" />
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-black/5 p-4">
          <SkeletonBlock className="h-4 w-48" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1.5fr_1fr_1fr_6rem] gap-4">
              <SkeletonBlock className="h-4" />
              <SkeletonBlock className="h-4" />
              <SkeletonBlock className="h-4" />
              <SkeletonBlock className="h-4" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
