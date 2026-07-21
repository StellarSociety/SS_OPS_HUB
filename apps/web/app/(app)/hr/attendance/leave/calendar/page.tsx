import { Suspense } from "react";
import { LeaveCalendarClient } from "@/components/hr/leave-calendar-client";
import { getLeaveCalendarMonth } from "@/lib/actions/hr-leave";

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function LeaveCalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const parsedYear = Number(params.year);
  const parsedMonth = Number(params.month);
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : now.getFullYear();
  const month =
    Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : now.getMonth() + 1;

  const data = await getLeaveCalendarMonth({ year, month });

  return (
    <Suspense fallback={<p className="text-sm text-black/50">Loading calendar…</p>}>
      <LeaveCalendarClient
        year={data.year}
        month={data.month}
        events={data.events}
        leaveTypes={data.leaveTypes}
        departments={data.departments}
        canManage={data.canManage}
        error={data.error}
      />
    </Suspense>
  );
}
