import { FlightTicketEntitlementsTable } from "@/components/hr/flight-ticket-entitlements-table";
import { loadFlightTicketEntitlements } from "@/lib/hr/benefits/flight-ticket-store";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditBenefits } from "@/lib/hr/permissions";

export default async function HrBenefitsFlightTicketPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEdit = canEditBenefits(permissions, venue.id);

  const data = await loadFlightTicketEntitlements(supabase, venue.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Flight Ticket</h2>
        <p className="text-sm text-black/55">
          Annual fly-home ticket entitlement by nationality value. Employees
          become entitled after completing one year of service (Full-time only —
          Part-time and Freelancing are excluded). Payable is pro-rated for
          unpaid leave and imported into payroll in the anniversary month.
        </p>
      </div>

      <FlightTicketEntitlementsTable
        rows={data.rows}
        canEdit={canEdit}
        migrationRequired={data.migrationRequired}
      />
    </div>
  );
}
