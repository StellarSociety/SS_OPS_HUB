import { HiringCalendarClient } from "@/components/hr/hiring-calendar-client";
import { listHiringAppointments } from "@/lib/hr/hiring/store";
import { getHrPageContext } from "@/lib/hr/page-context";
import { createServiceClient } from "@/lib/supabase/service";

export default async function HiringCalendarPage() {
  const { venue } = await getHrPageContext();
  const appointments = await listHiringAppointments(
    createServiceClient(),
    venue.id,
  );
  return <HiringCalendarClient appointments={appointments} />;
}
