import { GraduationCap } from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { getHrPageContext } from "@/lib/hr/page-context";

/**
 * Placeholder page — see the note in ../insurance/page.tsx. The sidebar linked
 * here with no route behind it, so requests fell through to /hr/[id].
 */
export default async function HrCertificationsPage() {
  const { venue } = await getHrPageContext();

  return (
    <div className="space-y-6">
      <div>
        <ModulePageTitle>Certifications</ModulePageTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {venue.name ?? "Venue"} staff certifications and expiry
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <GraduationCap
            className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            Certification tracking is not set up yet.
          </p>
        </div>
      </div>
    </div>
  );
}
