import { Suspense } from "react";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { DailyLogsPanel } from "@/components/save-log/daily-logs-panel";
import { Card } from "@/components/ui/card";
import { canAccessLogs } from "@/lib/save-log/permissions";
import { getSaveLogLogsPage } from "@/lib/save-log/page-context";
import { isIsoDate, todayIsoDate } from "@/lib/save-log/types";

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function SaveLogLogsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requested = params.date ?? todayIsoDate();
  const logDate = isIsoDate(requested) ? requested : todayIsoDate();
  const { venue, permissions, types, records, datesWithEntries, canEdit } =
    await getSaveLogLogsPage(logDate);

  if (!canAccessLogs(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Daily Logs</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Upload and review HACCP daily records for {venue.name}.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <Suspense fallback={<Card className="p-6">Loading daily logs…</Card>}>
        <DailyLogsPanel
          types={types}
          records={records}
          datesWithEntries={datesWithEntries}
          canEdit={canEdit}
        />
      </Suspense>
    </div>
  );
}
