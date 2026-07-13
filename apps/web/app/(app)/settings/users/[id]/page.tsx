import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { notFound } from "next/navigation";
import { UserAccessEditor } from "@/components/settings/user-access-editor";
import { UserAccessLogs } from "@/components/settings/user-access-logs";
import { UserActionsPanel } from "@/components/settings/user-actions-panel";
import { buildEditorState } from "@/lib/access/roles";
import { getUserById, listAccessEvents, listVenues } from "@/lib/access/store";
import { createServiceClient } from "@/lib/supabase/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SettingsUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const service = createServiceClient();

  const [user, venues, events] = await Promise.all([
    getUserById(service, id),
    listVenues(service),
    listAccessEvents(service, id, 50),
  ]);

  if (!user) notFound();

  const editorState = buildEditorState(user);

  const isSuperAdmin = editorState.accountRole === "global_admin";

  const subtitle = isSuperAdmin
    ? "SS-OPS-HUB SUPERADMIN"
    : user.is_external
      ? "External user · not linked to HR"
      : user.staff
        ? `${user.staff.emp_no} · ${user.staff.position?.name ?? "—"} · ${user.staff.department?.name ?? "—"} · Home: ${user.staff.home_venue?.name ?? "—"}`
        : "No staff record linked";

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
        <p className="mt-1 text-sm text-black/60">{subtitle}</p>
      </div>

      <UserActionsPanel user={user} />

      <UserAccessEditor
        userId={user.id}
        initialState={editorState}
        venues={venues}
      />

      <UserAccessLogs events={events} />
    </div>
  );
}
