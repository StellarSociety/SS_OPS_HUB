import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";
import { SalesWaitersSettingsPanel } from "@/components/sales/sales-waiters-settings-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { listStaffForVenue } from "@/lib/hr/store";
import { listVenueWaiters } from "@/lib/sales/waiters-store";
import type { WaiterStaffOption } from "@/lib/sales/waiters-types";
import {
  canAccessSalesSettings,
  canManageSalesWaiters,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesWaitersSettingsPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessSalesSettings(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  try {
    const [waiters, staffRows] = await Promise.all([
      listVenueWaiters(supabase, venue.id),
      listStaffForVenue(supabase, venue.id),
    ]);

    const staffOptions: WaiterStaffOption[] = staffRows
      .map((s) => ({
        id: s.id,
        full_name: s.full_name,
        first_name:
          s.first_name?.trim() ||
          s.full_name.trim().split(/\s+/)[0] ||
          null,
        emp_no: s.emp_no,
        position_name: s.position?.name ?? null,
        department_name: s.department?.name ?? null,
        employment_status_name: s.employment_status?.name ?? null,
        terminated: Boolean(s.termination_date),
      }))
      .sort((a, b) => {
        if (a.terminated !== b.terminated) return a.terminated ? 1 : -1;
        return a.full_name.localeCompare(b.full_name);
      });

    return (
      <>
        <SalesSettingsSubNav />
        <SalesWaitersSettingsPanel
          waiters={waiters}
          staffOptions={staffOptions}
          canEdit={canManageSalesWaiters(permissions, venue.id)}
        />
      </>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return (
        <>
          <SalesSettingsSubNav />
          <SalesSchemaSetupNotice />
        </>
      );
    }

    return (
      <>
        <SalesSettingsSubNav />
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load waiters
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading the waiter roster.
          </p>
        </Card>
      </>
    );
  }
}
