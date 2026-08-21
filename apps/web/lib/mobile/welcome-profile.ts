import { computeEmploymentDuration, computeWorkTime } from "@/lib/hr/derived";
import { getRenderClient, getRenderUser } from "@/lib/auth/render-user";
import { canManageProfileAvatar } from "@/lib/user/can-manage-profile-avatar";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";

export type MobileWelcomeProfile = {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  empNo: string | null;
  department: string | null;
  position: string | null;
  employmentDuration: string | null;
  workTime: string | null;
  employmentStatus: string | null;
  workingStatus: string | null;
};

type Named = { name?: string | null } | { name?: string | null }[] | null;

type StaffShape = {
  photo_url?: string | null;
  emp_no?: string | null;
  joining_date?: string | null;
  termination_date?: string | null;
  unpaid_leave_days_total?: number | null;
  department?: Named;
  position?: Named;
  employment_status?: Named;
  working_status?: Named;
};

type ProfileShape = {
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  is_external?: boolean | null;
  staff?: StaffShape | StaffShape[] | null;
} | null;

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function named(value: Named): string | null {
  const row = unwrap(value);
  const name = row?.name?.trim();
  return name || null;
}

const STAFF_SELECT = `
  email,
  full_name,
  avatar_url,
  is_external,
  staff:staff_id (
    photo_url,
    emp_no,
    joining_date,
    termination_date,
    unpaid_leave_days_total,
    department:department_id ( name ),
    position:position_id ( name ),
    employment_status:employment_status_id ( name ),
    working_status:working_status_id ( name )
  )
`;

export async function loadMobileWelcomeProfile(): Promise<MobileWelcomeProfile> {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  const empty: MobileWelcomeProfile = {
    fullName: null,
    email: user?.email ?? "",
    avatarUrl: null,
    empNo: null,
    department: null,
    position: null,
    employmentDuration: null,
    workTime: null,
    employmentStatus: null,
    workingStatus: null,
  };

  if (!user) return empty;

  const { data, error } = await supabase
    .from("profiles")
    .select(STAFF_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  const profile = (error ? null : data) as ProfileShape;
  const staff = unwrap(profile?.staff ?? null);
  const email = profile?.email ?? user.email ?? "";
  const preferStaffPhoto = !canManageProfileAvatar({
    is_external: profile?.is_external,
    email,
    staff: staff ? { emp_no: staff.emp_no } : null,
  });
  const metadata = user.user_metadata as Record<string, unknown> | undefined;

  return {
    fullName: profile?.full_name ?? null,
    email,
    avatarUrl: resolveAvatarUrl({
      profileAvatarUrl: profile?.avatar_url,
      staffPhotoUrl: staff?.photo_url ?? null,
      preferStaffPhoto,
      userMetadata: metadata,
    }),
    empNo: staff?.emp_no?.trim() || null,
    department: named(staff?.department ?? null),
    position: named(staff?.position ?? null),
    employmentDuration: computeEmploymentDuration(
      staff?.joining_date,
      staff?.termination_date,
    ),
    workTime: computeWorkTime(
      staff?.joining_date,
      staff?.termination_date,
      staff?.unpaid_leave_days_total ?? 0,
    ),
    employmentStatus: named(staff?.employment_status ?? null),
    workingStatus: named(staff?.working_status ?? null),
  };
}
