import { Package } from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { getHrPageContext } from "@/lib/hr/page-context";

/**
 * Placeholder page — claims /hr/assets so it does not fall through to /hr/[id].
 */
export default async function HrAssetsPage() {
  const { venue } = await getHrPageContext();

  return (
    <div className="space-y-6">
      <div>
        <ModulePageTitle>Assets</ModulePageTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {venue.name ?? "Venue"} staff assets
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <Package
            className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            Asset tracking is not set up yet.
          </p>
        </div>
      </div>
    </div>
  );
}
