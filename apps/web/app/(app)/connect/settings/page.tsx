import { ArrowLeft, Bell, Phone, Users } from "lucide-react";
import { ConnectCallSettings } from "@/components/connect/call-settings";
import { ConnectGroupsAdmin } from "@/components/connect/connect-groups-admin";
import { ConnectNotificationSettings } from "@/components/connect/notification-settings";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ScopedLink } from "@/components/layout/scoped-link";
import { getAlertPrefs } from "@/lib/connect/notification-prefs";
import { getConnectPageContext } from "@/lib/connect/page-context";
import { listConnectGroups } from "@/lib/connect/store";
import { loadVenueSoundDefaults } from "@/lib/connect/venue-sound-defaults";
import { segmentedSubNavLinkClass, segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

type Tab = "groups" | "notifications" | "calls";

export default async function ConnectSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { service, venue, user, seesAllGroups, isConnectAdmin } =
    await getConnectPageContext();
  const params = await searchParams;

  // Group setup is for admins; everyone can set their own notifications.
  const tab: Tab =
    params.tab === "calls"
      ? "calls"
      : !seesAllGroups || params.tab === "notifications"
        ? "notifications"
        : "groups";

  const [groups, prefs, soundDefaults] = await Promise.all([
    tab === "groups"
      ? listConnectGroups(
          service,
          venue.id,
          { userId: user.id, seesAllGroups: true, isConnectAdmin },
          { includeArchived: true },
        )
      : Promise.resolve([]),
    tab === "notifications" ? getAlertPrefs(service, user.id) : Promise.resolve(null),
    tab === "notifications" ? loadVenueSoundDefaults(service, venue.id) : Promise.resolve(null),
  ]);

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    ...(seesAllGroups ? [{ key: "groups" as const, label: "Groups", icon: Users }] : []),
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "calls", label: "Calls", icon: Phone },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <ScopedLink
          href="/connect/chats"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-black/55 hover:text-black/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Connecteam
        </ScopedLink>
        <ModulePageTitle>Connecteam Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          {tab === "groups"
            ? `Groups for ${venue.name}. Open a group to set each employee's rights.`
            : tab === "calls"
              ? "Voice and video calls on this device: camera, mirror and devices. The call ringtone is with the other sounds under Notifications."
              : "How and when Connecteam alerts you about chats and the feed."}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {tabs.length > 1 ? (
        <nav className={segmentedSubNavShellClass} aria-label="Settings sections">
          {tabs.map(({ key, label, icon: Icon }) => (
            <ScopedLink
              key={key}
              href={key === "groups" ? "/connect/settings" : `/connect/settings?tab=${key}`}
              aria-current={tab === key ? "page" : undefined}
              className={segmentedSubNavLinkClass(tab === key)}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </ScopedLink>
          ))}
        </nav>
      ) : null}

      {tab === "groups" ? (
        <ConnectGroupsAdmin groups={groups} canEdit={isConnectAdmin} />
      ) : tab === "calls" ? (
        <ConnectCallSettings />
      ) : prefs ? (
        <ConnectNotificationSettings
          initialPrefs={prefs}
          venueName={venue.name}
          soundDefaults={soundDefaults}
          canSetDefaults={isConnectAdmin}
        />
      ) : null}
    </div>
  );
}
