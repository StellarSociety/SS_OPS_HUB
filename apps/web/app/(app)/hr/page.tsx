import Link from "next/link";
import { redirect } from "next/navigation";
import { HrSubNav } from "@/components/hr/hr-sub-nav";
import { ExpiryWidgets } from "@/components/hr/expiry-widgets";
import { StaffDirectory } from "@/components/hr/staff-directory";
import { canViewStaff } from "@/lib/hr/permissions";
import {
  getExpiryItems,
  listDepartments,
  listEmploymentStatuses,
  listStaffForVenue,
} from "@/lib/hr/store";
import { DEFAULT_EXPIRY_LEAD_DAYS } from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";

async function getHrPageContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!slug) redirect("/select-venue");

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, venue, permissions: permissions ?? [] };
}

export default async function HrPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canViewStaff(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Human Resources for this venue.
        </p>
      </div>
    );
  }

  const [staff, departments, statuses, expiryItems] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    listDepartments(supabase, venue.id),
    listEmploymentStatuses(supabase),
    getExpiryItems(supabase, venue.id, DEFAULT_EXPIRY_LEAD_DAYS),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Human Resources</h1>
        <p className="mt-1 text-sm text-black/60">
          {venue.is_global
            ? "Group staff — corporate and multi-venue personnel"
            : `${venue.name} venue staff roster`}
        </p>
      </div>

      <HrSubNav />

      <ExpiryWidgets
        items={expiryItems}
        leadDays={DEFAULT_EXPIRY_LEAD_DAYS}
        title="Expiry alerts"
      />

      <StaffDirectory
        staff={staff}
        departments={departments}
        statuses={statuses}
      />
    </div>
  );
}
