import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { notFound } from "next/navigation";
import { UserAccessEditor } from "@/components/settings/user-access-editor";
import { MobileAppAccessCard } from "@/components/settings/mobile-app-access-card";
import { UserAccessLogs } from "@/components/settings/user-access-logs";
import { UserActionsPanel } from "@/components/settings/user-actions-panel";
import { getAccessMatrixAppColumns } from "@/lib/access/matrix";
import { fetchAppModuleStateMap } from "@/lib/app-module-states";
import { getRenderVenue } from "@/lib/auth/render-user";
import { buildEditorState } from "@/lib/access/roles";
import { PHONE_APP_SWITCH_KEY, PHONE_HUB_KEY } from "@/lib/mobile/phone-access";
import { getSubPagesForModule } from "@/lib/modules-catalog";
import { getModuleOverviewByCategory } from "@/lib/modules-registry";
import { getUserById, listVenues } from "@/lib/access/store";
import { createServiceClient } from "@/lib/supabase/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SettingsUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const service = createServiceClient();

  const [user, venues, appStateMap, currentVenue] = await Promise.all([
    getUserById(service, id),
    listVenues(service),
    fetchAppModuleStateMap(service),
    getRenderVenue(),
  ]);

  if (!user) notFound();

  const editorState = buildEditorState(user);
  const iconByKey = new Map(
    getModuleOverviewByCategory().flatMap(({ modules }) =>
      modules.map((mod) => [mod.key, mod.iconKey] as const),
    ),
  );
  const phoneApps = getAccessMatrixAppColumns().map((app) => ({
    ...app,
    iconKey: iconByKey.get(app.key),
  }));

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
        appStates={Object.fromEntries(appStateMap)}
        defaultVenueId={
          currentVenue && !currentVenue.is_global ? currentVenue.id : null
        }
      />

      <MobileAppAccessCard
        userId={user.id}
        venues={venues}
        defaultVenueId={
          (currentVenue && !currentVenue.is_global ? currentVenue.id : null) ??
          user.staff?.home_venue?.id ??
          null
        }
        apps={phoneApps}
        hubPages={getSubPagesForModule(PHONE_HUB_KEY).map((page) => ({
          key: page.key,
          label: page.label,
        }))}
        switchKey={PHONE_APP_SWITCH_KEY}
        hubKey={PHONE_HUB_KEY}
      />

      <UserAccessLogs userId={user.id} />
    </div>
  );
}
