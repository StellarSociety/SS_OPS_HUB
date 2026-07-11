import { redirect } from "next/navigation";
import { LookupsAdmin } from "@/components/hr/lookups-admin";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAdminLookups } from "@/lib/hr/permissions";
import {
  listDepartments,
  listEmploymentStatuses,
  listNationalities,
  listPositions,
} from "@/lib/hr/store";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";

export default async function HrLookupsPage() {
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

  const perms = permissions ?? [];
  if (!canAdminLookups(perms, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <ModulePageTitle>Lookups</ModulePageTitle>
        <p className="text-sm text-black/60">
          Admin access to HR lookups is required to manage this page.
        </p>
      </div>
    );
  }

  const [departments, positions, statuses, nationalities] = await Promise.all([
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
    listEmploymentStatuses(supabase),
    listNationalities(supabase),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <ModulePageTitle>HR lookups</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Departments, positions, statuses, and nationalities for {venue.name}.
        </p>
      </div>
      <LookupsAdmin
        departments={departments}
        positions={positions}
        statuses={statuses}
        nationalities={nationalities}
      />
    </div>
  );
}
