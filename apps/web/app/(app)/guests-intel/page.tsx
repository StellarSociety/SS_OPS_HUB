import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { GuestsIntelDashboardMetrics } from "@/components/guests-intel/dashboard-metrics";
import { GuestsIntelWelcome } from "@/components/guests-intel/guests-intel-welcome";
import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import {
  canAccessOverview,
  firstAccessibleGuestsIntelPath,
} from "@/lib/guests-intel/permissions";
import { getGuestsIntelDashboardPage } from "@/lib/guests-intel/page-context";
import { scopedPath } from "@/lib/venue/active-venue";
import { redirect } from "next/navigation";

export default async function GuestsIntelDashboardPage() {
  const { venue, permissions, user, supabase, stats } =
    await getGuestsIntelDashboardPage();

  if (!canAccessOverview(permissions, venue.id)) {
    const fallback = firstAccessibleGuestsIntelPath(permissions, venue.id);
    if (fallback && fallback !== "/guests-intel") {
      redirect(await scopedPath(fallback));
    }
    return <AccessDeniedBounce />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const userName = (profile?.full_name as string | null)?.trim() || null;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <GuestsIntelWelcome venue={venue} userName={userName} />

      <div>
        <ModuleShortcuts basePath="/guests-intel" ariaLabel="Guests Intel apps" />
        <hr className="mt-4 border-black/10" />
      </div>

      <GuestsIntelDashboardMetrics {...stats} />
    </div>
  );
}
