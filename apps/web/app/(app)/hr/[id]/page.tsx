import Link from "next/link";
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
  getStaffById,
  listDepartments,
  listEmploymentStatuses,
  listNationalities,
  listPositions,
} from "@/lib/hr/store";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
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
  if (!canAccessStaff(perms, venue.id)) {
    redirect("/hr");
  }

  const staffRaw = await getStaffById(supabase, id, venue.id);
  if (
    !canViewStaff(perms, venue.id) &&
    staffRaw.created_by !== user.id
  ) {
    redirect("/hr");
  }
  const staff = maskSensitiveStaffFields(staffRaw, perms, venue.id);

  const [departments, positions, statuses, nationalities] = await Promise.all([
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
    listEmploymentStatuses(supabase),
    listNationalities(supabase),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/hr"
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
        canEdit={canEditOwnStaff(perms, venue.id, staffRaw.created_by, user.id)}
        canViewSalary={canViewSalary(perms, venue.id)}
      />
    </div>
  );
}
