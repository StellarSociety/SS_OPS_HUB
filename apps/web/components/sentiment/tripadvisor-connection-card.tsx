import { TripAdvisorMark } from "@/components/sentiment/channel-marks";
import { Card } from "@/components/ui/card";

export function TripadvisorConnectionCard() {
  return (
    <Card className="space-y-3 p-5 opacity-80">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
            <TripAdvisorMark className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-[#3D421F]">TripAdvisor</h2>
            <p className="text-sm text-black/55">
              Connect the venue TripAdvisor listing in a later step.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-black/50">
          Coming next
        </span>
      </div>
    </Card>
  );
}
