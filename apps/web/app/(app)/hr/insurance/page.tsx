import { ShieldCheck } from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { getHrPageContext } from "@/lib/hr/page-context";

/**
 * Placeholder page.
 *
 * The sidebar has always linked to /hr/insurance, but no route existed, so the
 * request fell through to /hr/[id] and passed "insurance" to Postgres as a staff
 * UUID (error 22P02, digest 11756682@E394). This page claims the route.
 */
export default async function HrInsurancePage() {
  const { venue } = await getHrPageContext();

  return (
    <div className="space-y-6">
      <div>
        <ModulePageTitle>Insurance</ModulePageTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {venue.name ?? "Venue"} staff insurance records
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldCheck
            className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            Insurance tracking is not set up yet.
          </p>
        </div>
      </div>
    </div>
  );
}
