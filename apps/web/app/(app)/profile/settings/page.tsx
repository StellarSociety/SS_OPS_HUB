import { redirect } from "next/navigation";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { ProfilePasswordCard } from "@/components/profile/profile-password-card";
import { UserAvatarField } from "@/components/profile/user-avatar-field";
import { Card } from "@/components/ui/card";
import { canManageProfileAvatar } from "@/lib/user/can-manage-profile-avatar";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `
      email,
      full_name,
      avatar_url,
      is_external,
      staff:staff_id ( emp_no, photo_url )
    `,
    )
    .eq("id", user.id)
    .maybeSingle();

  type ProfileShape = {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    is_external?: boolean | null;
    staff?:
      | { emp_no?: string | null; photo_url?: string | null }
      | { emp_no?: string | null; photo_url?: string | null }[]
      | null;
  };

  const p = profile as ProfileShape | null;
  const staffRaw = Array.isArray(p?.staff) ? p?.staff[0] : p?.staff;
  const email = p?.email ?? user.email ?? "";
  const fullName = p?.full_name ?? user.email ?? "User";
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = resolveAvatarUrl({
    profileAvatarUrl: p?.avatar_url,
    staffPhotoUrl: staffRaw?.photo_url ?? null,
    userMetadata: metadata,
  });

  const avatarEditor = canManageProfileAvatar({
    is_external: p?.is_external,
    email,
    staff: staffRaw ? { emp_no: staffRaw.emp_no } : null,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-sm text-black/50 transition-colors hover:text-[#3D421F]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>
        <h1 className="font-serif text-2xl text-[#3D421F]">Profile settings</h1>
        <p className="text-sm text-black/50">
          Update your sign-in password and, when allowed, your profile photo.
        </p>
      </div>

      {avatarEditor ? (
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">Profile photo</h2>
          <UserAvatarField
            userId={user.id}
            avatarUrl={avatarUrl}
            fullName={fullName}
            email={email}
          />
        </Card>
      ) : (
        <Card className="p-4 text-sm text-black/60 sm:p-6">
          Your profile photo is managed from your staff record. Contact your
          venue administrator or HR if it needs to be updated.
        </Card>
      )}

      <ProfilePasswordCard />
    </div>
  );
}
