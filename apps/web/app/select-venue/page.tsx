import { redirect } from "next/navigation";
import { SelectVenueWelcome } from "@/components/venue/select-venue-welcome";
import { VenueGrid } from "@/components/venue/venue-grid";
import { canAccessGlobal } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { normalizeVenueRows } from "@/lib/venue/normalize";

export default async function SelectVenuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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

  type StaffShape = {
    photo_url?: string | null;
    emp_no?: string | null;
    position?: { name: string } | { name: string }[] | null;
  };

  type ProfileShape = {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    staff?: StaffShape | StaffShape[] | null;
  } | null;

  function unwrapStaff(
    staff: ProfileShape extends infer P
      ? P extends { staff?: infer S }
        ? S
        : never
      : never,
  ): StaffShape | null {
    if (staff == null) return null;
    return Array.isArray(staff) ? (staff[0] ?? null) : staff;
  }

  let profile = profileResult.data as ProfileShape;

  if (profileResult.error) {
    const { data: profileFallback } = await supabase
      .from("profiles")
      .select(
        `email, full_name, staff:staff_id ( photo_url, emp_no, position:position_id ( name ) )`,
      )
      .eq("id", user.id)
      .maybeSingle();
    profile = profileFallback as ProfileShape;
  }

  const staff = unwrapStaff(profile?.staff ?? null);
  const staffPhoto = staff?.photo_url ?? null;
  const positionRaw = staff?.position;
  const positionName =
    positionRaw == null
      ? null
      : Array.isArray(positionRaw)
        ? (positionRaw[0]?.name ?? null)
        : positionRaw.name;
  const empNo = staff?.emp_no?.trim() || null;

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = resolveAvatarUrl({
    profileAvatarUrl: profile?.avatar_url,
    staffPhotoUrl: staffPhoto,
    userMetadata: metadata,
  });

  const normalized = normalizeVenueRows(venues ?? []);
  const globalVenue = normalized.find((venue) => venue.is_global);
  const operational = normalized.filter((venue) => !venue.is_global);
  const showGlobal = canAccessGlobal(permissions ?? []);
  const displayVenues =
    showGlobal && globalVenue ? [globalVenue, ...operational] : operational;

  return (
    <div className="relative h-dvh overflow-hidden bg-[#E9E3D6]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_55%)]" />
      <div className="relative grid h-full grid-rows-[3fr_auto_auto_1fr]">
        <div className="flex min-h-0 items-end justify-center px-4 pb-6 pt-10 sm:pb-10 sm:pt-14">
          <SelectVenueWelcome
            fullName={profile?.full_name ?? null}
            email={profile?.email ?? user.email ?? ""}
            avatarUrl={avatarUrl}
            empNo={empNo}
            position={positionName}
          />
        </div>
        <div
          className="mx-auto h-px w-full max-w-3xl shrink-0 bg-[#3D421F]/15"
          role="separator"
          aria-hidden
        />
        <div className="flex min-h-0 items-center justify-center overflow-hidden px-4 pt-4 sm:pt-6">
          <VenueGrid venues={displayVenues} />
        </div>
        <div aria-hidden />
      </div>
    </div>
  );
}
