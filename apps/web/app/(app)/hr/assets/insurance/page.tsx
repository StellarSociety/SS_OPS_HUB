import { ShieldCheck } from "lucide-react";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrAssetsInsurancePage() {
  const { venue } = await getHrPageContext();

  return (
    <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <ShieldCheck
          className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          {venue.name ?? "Venue"} staff insurance tracking is not set up yet.
        </p>
      </div>
    </div>
  );
}
