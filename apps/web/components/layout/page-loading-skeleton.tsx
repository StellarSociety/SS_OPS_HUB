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

export function PageLoadingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-none space-y-6" aria-hidden>
      <div className="space-y-3">
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-4 w-full max-w-md" />
        <div className="h-px w-full bg-black/10" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-5 h-9 w-32" />
          <SkeletonBlock className="mt-3 h-3 w-40" />
        </Card>
        <Card className="p-5">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-5 h-9 w-24" />
          <SkeletonBlock className="mt-3 h-3 w-36" />
        </Card>
        <Card className="p-5">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="mt-5 h-9 w-28" />
          <SkeletonBlock className="mt-3 h-3 w-44" />
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-black/5 p-4">
          <SkeletonBlock className="h-4 w-48" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 7 }).map((_, index) => (
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
