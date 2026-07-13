import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import { UsersList } from "@/components/settings/users-list";
import { UsersSubNav } from "@/components/settings/users-sub-nav";
import { listUsers, listVenues } from "@/lib/access/store";
import { createServiceClient } from "@/lib/supabase/service";

export default async function SettingsUsersPage() {
  const service = createServiceClient();

  const [users, venues] = await Promise.all([
    listUsers(service),
    listVenues(service),
  ]);

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

      <UsersList users={users} venues={venues} />
    </div>
  );
}
