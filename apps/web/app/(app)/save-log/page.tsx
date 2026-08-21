import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import { SaveLogDashboardMetrics } from "@/components/save-log/dashboard-metrics";
import { SaveLogWelcome } from "@/components/save-log/save-log-welcome";
import {
  canAccessOverview,
  firstAccessibleSaveLogPath,
} from "@/lib/save-log/permissions";
import { getSaveLogDashboardPage } from "@/lib/save-log/page-context";
import { scopedPath } from "@/lib/venue/active-venue";
import { redirect } from "next/navigation";

export default async function SaveLogDashboardPage() {
  const { venue, permissions, user, supabase, types, weekRecords, monthRecords, today } =
    await getSaveLogDashboardPage();

  if (!canAccessOverview(permissions, venue.id)) {
    const fallback = firstAccessibleSaveLogPath(permissions, venue.id);
    if (fallback && fallback !== "/save-log") {
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
      <SaveLogWelcome venue={venue} userName={userName} />

      <div>
        <ModuleShortcuts basePath="/save-log" ariaLabel="SafeLog apps" />
        <hr className="mt-4 border-black/10" />
      </div>

      <SaveLogDashboardMetrics
        today={today}
        types={types}
        weekRecords={weekRecords}
        monthRecords={monthRecords}
      />
    </div>
  );
}
