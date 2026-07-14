import { HrOverview } from "@/components/hr/hr-overview";
import { HrWelcome } from "@/components/hr/hr-welcome";
import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import { canAccessStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { buildHrOverviewStats } from "@/lib/hr/overview";
import { listStaffForVenue } from "@/lib/hr/store";

export default async function HrOverviewPage() {
  const { supabase, venue, permissions, user } = await getHrPageContext();

  if (!canAccessStaff(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Human Resources for this venue.
        </p>
      </div>
    );
  }

  const [{ data: profile }, staff] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    listStaffForVenue(supabase, venue.id),
  ]);

  const userName = (profile?.full_name as string | null)?.trim() || null;
  const stats = buildHrOverviewStats(staff, []);

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <HrWelcome venue={venue} userName={userName} />

      <div>
        <ModuleShortcuts basePath="/hr" ariaLabel="Human Resources apps" />
        <hr className="mt-4 border-black/10" />
      </div>

      <HrOverview stats={stats} />
    </div>
  );
}
