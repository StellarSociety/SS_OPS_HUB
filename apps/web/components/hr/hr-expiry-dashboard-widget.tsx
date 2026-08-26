import { createClient } from "@/lib/supabase/server";
import { DEFAULT_EXPIRY_LEAD_DAYS, partitionExpiryItems } from "@/lib/hr/types";
import { getExpiryItems } from "@/lib/hr/store";
import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import type { DashboardWidgetProps } from "@/lib/dashboard-widgets";
import { GraduationCap } from "lucide-react";

export async function HrExpiryDashboardWidget({
  venueId,
  isGlobalVenue,
  leadDays = DEFAULT_EXPIRY_LEAD_DAYS,
}: DashboardWidgetProps) {
  const supabase = await createClient();
  const items = await getExpiryItems(supabase, venueId, leadDays, {
    allVenues: isGlobalVenue,
  });
  const { documents, trainings } = partitionExpiryItems(items);

  return (
    <div className="space-y-4">
      <ExpiryWidgets
        items={documents}
        leadDays={leadDays}
        title="Upcoming expiries"
        titleClassName="font-serif text-3xl text-[#3D421F]"
        compact
        emptyDescription={`No passport, ID, visa, or insurance items expiring within ${leadDays} days.`}
      />
      <ExpiryWidgets
        items={trainings}
        leadDays={leadDays}
        title="Training expiries"
        icon={GraduationCap}
        compact
        emptyDescription={`No training certificates expiring within ${leadDays} days.`}
      />
    </div>
  );
}
