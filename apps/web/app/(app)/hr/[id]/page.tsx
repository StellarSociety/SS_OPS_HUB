import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StaffDetailView } from "@/components/hr/staff-detail";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import {
  canAccessStaff,
  canEditOwnStaff,
  canViewSalary,
  canViewStaff,
  maskSensitiveStaffFields,
} from "@/lib/hr/permissions";
import {
  getHrVenueSetting,
  getStaffById,
  listCivilStatuses,
  listDepartments,
  listEmploymentStatuses,
  listGenders,
  listNationalities,
  listPositions,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import { StatusBadge } from "@/components/hr/status-badge";

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  const perms = permissions ?? [];
  if (!canAccessStaff(perms, venue.id)) {
    redirect("/hr");
  }

  const staffRaw = await getStaffById(supabase, id, venue.id);
  if (!canViewStaff(perms, venue.id) && staffRaw.created_by !== user.id) {
    redirect("/hr/staff");
  }
  const staff = maskSensitiveStaffFields(staffRaw, perms, venue.id);
  const showSalary = canViewSalary(perms, venue.id);

  const [
    departments,
    positions,
    statuses,
    nationalities,
    genders,
    civilStatuses,
    salaryDefaults,
  ] = await Promise.all([
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
    listEmploymentStatuses(supabase),
    listNationalities(supabase),
    listGenders(supabase),
    listCivilStatuses(supabase),
    getHrVenueSetting(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.salaryDefaults,
      DEFAULT_HR_SALARY_DEFAULTS,
    ),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/hr/staff"
        className="inline-flex items-center gap-1 text-sm text-black/50 hover:text-[#3D421F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to directory
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <ModulePageTitle>{staff.full_name}</ModulePageTitle>
          <p className="mt-1 font-mono text-sm text-black/50">{staff.emp_no}</p>
        </div>
        <StatusBadge status={staff.employment_status?.name} />
      </div>

      <StaffDetailView
        staff={staff}
        departments={departments}
        positions={positions}
        statuses={statuses}
        nationalities={nationalities}
        genders={genders}
        civilStatuses={civilStatuses}
        salaryPct={{
          basic: salaryDefaults.basicPct,
          accom: salaryDefaults.accomPct,
          transp: salaryDefaults.transpPct,
        }}
        canEdit={canEditOwnStaff(perms, venue.id, staffRaw.created_by, user.id)}
        canViewSalary={showSalary}
        venueName={venue.name}
      />
    </div>
  );
}
