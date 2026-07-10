import { createClient } from "@/lib/supabase/server";
import { DEFAULT_EXPIRY_LEAD_DAYS } from "@/lib/hr/types";
import { getExpiryItems } from "@/lib/hr/store";
import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import type { DashboardWidgetProps } from "@/lib/modules-registry";

export async function HrExpiryDashboardWidget({
  venueId,
  leadDays = DEFAULT_EXPIRY_LEAD_DAYS,
}: DashboardWidgetProps) {
  const supabase = await createClient();
  const items = await getExpiryItems(supabase, venueId, leadDays);

  return (
    <ExpiryWidgets
      items={items}
      leadDays={leadDays}
      title="Human Resources — upcoming expiries"
      compact
    />
  );
}
