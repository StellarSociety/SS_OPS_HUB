import Link from "next/link";
import { notFound } from "next/navigation";
import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import { UserActionsPanel } from "@/components/settings/user-actions-panel";
import { UserPermissionsGrid } from "@/components/settings/user-permissions-grid";
import { getUserById, listVenues } from "@/lib/access/store";
import { createServiceClient } from "@/lib/supabase/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SettingsUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const service = createServiceClient();

  const [user, venues] = await Promise.all([
    getUserById(service, id),
    listVenues(service),
  ]);

  if (!user) notFound();

  const initialGrants = user.permissions.map((p) => ({
    module_key: p.module_key,
    feature_key: p.feature_key,
    access_level: p.access_level,
    venue_id: p.venue_id,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/settings/users"
          className="text-sm text-black/50 hover:text-[#3D421F]"
        >
          ← Back to users
        </Link>
        <h1 className="mt-2 font-serif text-3xl text-[#3D421F]">
          {user.full_name ?? user.email}
        </h1>
        <p className="mt-1 text-sm text-black/60">
          {user.staff ? (
            <>
              {user.staff.emp_no} · {user.staff.position?.name ?? "—"} ·{" "}
              {user.staff.department?.name ?? "—"} · Home:{" "}
              {user.staff.home_venue?.name ?? "—"}
            </>
          ) : (
            "No staff record linked"
          )}
        </p>
      </div>

      <SettingsSubNav />

      <UserActionsPanel
        userId={user.id}
        status={user.status}
        email={user.email}
      />

      <UserPermissionsGrid
        userId={user.id}
        initialGrants={initialGrants}
        venues={venues}
      />
    </div>
  );
}
