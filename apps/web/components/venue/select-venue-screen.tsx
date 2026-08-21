import { OnlinePresence } from "@/components/layout/online-presence";
import { SelectVenueWelcome } from "@/components/venue/select-venue-welcome";
import { VenueGrid } from "@/components/venue/venue-grid";
import { cn } from "@/lib/utils";
import type { Venue } from "@/lib/types/database";
import type { SelectVenuePageData } from "@/lib/venue/select-venue-page-data";

type SelectVenueScreenProps = SelectVenuePageData & {
  fill?: boolean;
  preview?: boolean;
  onSelectVenue?: (venue: Venue) => void;
  runtime?: "web" | "mobile";
};

export function SelectVenueScreen({
  fullName,
  email,
  avatarUrl,
  empNo,
  position,
  venues,
  fill = false,
  preview = false,
  onSelectVenue,
  runtime = "web",
}: SelectVenueScreenProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[#E9E3D6]",
        fill ? "h-full min-h-0" : "h-dvh",
      )}
    >
      {preview ? null : <OnlinePresence />}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_55%)]" />
      <div className="relative grid h-full grid-rows-[3fr_auto_auto_1fr]">
        <div className="flex min-h-0 items-end justify-center px-4 pb-6 pt-10 sm:pb-10 sm:pt-14">
          <SelectVenueWelcome
            fullName={fullName}
            email={email}
            avatarUrl={avatarUrl}
            empNo={empNo}
            position={position}
          />
        </div>
        <div
          className="mx-auto h-px w-full max-w-3xl shrink-0 bg-[#3D421F]/15"
          role="separator"
          aria-hidden
        />
        <div className="flex min-h-0 items-center justify-center overflow-hidden px-4 pt-4 sm:pt-6">
          <VenueGrid
            venues={venues}
            preview={preview}
            onSelectVenue={onSelectVenue}
            runtime={runtime}
          />
        </div>
        <div aria-hidden />
      </div>
    </div>
  );
}
