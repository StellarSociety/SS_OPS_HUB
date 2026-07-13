import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import { InviteUserPanel } from "@/components/settings/invite-user-panel";
import { UsersSubNav } from "@/components/settings/users-sub-nav";
import { listInviteableStaff, listVenues } from "@/lib/access/store";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/venue/active-venue";

export default async function SettingsInviteUserPage() {
  const service = createServiceClient();

  const [inviteableStaff, venues] = await Promise.all([
    listInviteableStaff(service),
    listVenues(service),
  ]);

  const active = await getActiveScope();
  const slug = active?.scope === "venue" ? active.slug : null;
  const currentVenue = venues.find((v) => v.slug === slug && !v.is_global);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Users & access</h1>
        <p className="mt-1 text-sm text-black/60">
          Invite staff or external people, then control access per app across
          four layers: apps, roles, sub-pages, and sensitive content.
        </p>
      </div>

      <SettingsSubNav />

      <UsersSubNav />

      <InviteUserPanel
        staff={inviteableStaff}
        currentVenueId={currentVenue?.id ?? null}
      />
    </div>
  );
}
