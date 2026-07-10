import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import { UsersList } from "@/components/settings/users-list";
import { listInviteableStaff, listUsers, listVenues } from "@/lib/access/store";
import { createServiceClient } from "@/lib/supabase/service";

export default async function SettingsUsersPage() {
  const service = createServiceClient();

  const [users, inviteableStaff, venues] = await Promise.all([
    listUsers(service),
    listInviteableStaff(service),
    listVenues(service),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Users & access</h1>
        <p className="mt-1 text-sm text-black/60">
          Every app user links to exactly one staff record. Access is granted
          separately from home venue.
        </p>
      </div>

      <SettingsSubNav />

      <UsersList
        users={users}
        inviteableStaff={inviteableStaff}
        venues={venues}
      />
    </div>
  );
}
