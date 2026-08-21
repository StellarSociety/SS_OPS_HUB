import { redirect } from "next/navigation";
import { canAccessGlobal } from "@/lib/role-permissions";
import { getRenderClient, getRenderUser } from "@/lib/auth/render-user";
import { canManageProfileAvatar } from "@/lib/user/can-manage-profile-avatar";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { normalizeVenueRows } from "@/lib/venue/normalize";
import type { Venue } from "@/lib/types/database";

export type SelectVenuePageData = {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  empNo: string | null;
  position: string | null;
  venues: Venue[];
};

type StaffShape = {
  photo_url?: string | null;
  emp_no?: string | null;
  position?: { name: string } | { name: string }[] | null;
};

type ProfileShape = {
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  is_external?: boolean | null;
  staff?: StaffShape | StaffShape[] | null;
} | null;

function unwrapStaff(staff: ProfileShape extends infer P
  ? P extends { staff?: infer S }
    ? S
    : never
  : never): StaffShape | null {
  if (staff == null) return null;
  return Array.isArray(staff) ? (staff[0] ?? null) : staff;
}

export async function loadSelectVenuePageData(
  options?: { signInHref?: string },
): Promise<SelectVenuePageData> {
  const supabase = await getRenderClient();
  const user = await getRenderUser();

  if (!user) {
    redirect(options?.signInHref ?? "/login");
  }

  const [{ data: venues }, { data: permissions }, profileResult] =
    await Promise.all([
      supabase.from("venues").select("*").order("created_at", { ascending: true }),
      supabase.from("user_permissions").select("*").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select(
          `
          email,
          full_name,
          avatar_url,
          is_external,
          staff:staff_id (
            photo_url,
            emp_no,
            position:position_id ( name )
          )
        `,
        )
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  let profile = profileResult.data as ProfileShape;

  if (profileResult.error) {
    const { data: profileFallback } = await supabase
      .from("profiles")
      .select(
        `email, full_name, avatar_url, is_external, staff:staff_id ( photo_url, emp_no, position:position_id ( name ) )`,
      )
      .eq("id", user.id)
      .maybeSingle();
    profile = profileFallback as ProfileShape;
  }

  const staff = unwrapStaff(profile?.staff ?? null);
  const positionRaw = staff?.position;
  const positionName =
    positionRaw == null
      ? null
      : Array.isArray(positionRaw)
        ? (positionRaw[0]?.name ?? null)
        : positionRaw.name;
  const empNo = staff?.emp_no?.trim() || null;
  const email = profile?.email ?? user.email ?? "";
  const preferStaffPhoto = !canManageProfileAvatar({
    is_external: profile?.is_external,
    email,
    staff: staff ? { emp_no: staff.emp_no } : null,
  });

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = resolveAvatarUrl({
    profileAvatarUrl: profile?.avatar_url,
    staffPhotoUrl: staff?.photo_url ?? null,
    preferStaffPhoto,
    userMetadata: metadata,
  });

  const normalized = normalizeVenueRows(venues ?? []);
  const globalVenue = normalized.find((venue) => venue.is_global);
  const operational = normalized.filter((venue) => !venue.is_global);
  const showGlobal = canAccessGlobal(permissions ?? []);
  const displayVenues =
    showGlobal && globalVenue ? [globalVenue, ...operational] : operational;

  return {
    fullName: profile?.full_name ?? null,
    email,
    avatarUrl,
    empNo,
    position: positionName,
    venues: displayVenues,
  };
}
