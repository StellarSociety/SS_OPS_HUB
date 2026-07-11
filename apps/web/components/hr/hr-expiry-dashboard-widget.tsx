import { createClient } from "@/lib/supabase/server";
import { DEFAULT_EXPIRY_LEAD_DAYS } from "@/lib/hr/types";
import { getExpiryItems } from "@/lib/hr/store";
import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import type { DashboardWidgetProps } from "@/lib/dashboard-widgets";

export async function HrExpiryDashboardWidget({
  venueId,
  isGlobalVenue,
  leadDays = DEFAULT_EXPIRY_LEAD_DAYS,
}: DashboardWidgetProps) {
  const supabase = await createClient();
  const items = await getExpiryItems(supabase, venueId, leadDays, {
    allVenues: isGlobalVenue,
  });

  return (
    <ExpiryWidgets
      items={items}
      leadDays={leadDays}
      title="Dashboards"
      titleClassName="font-serif text-3xl text-[#3D421F]"
      compact
    />
  );
}
