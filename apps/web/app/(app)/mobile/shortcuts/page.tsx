import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { MobileShortcutsClient } from "@/components/mobile/mobile-shortcuts-client";
import { listMobileAccessMatrix } from "@/lib/actions/mobile-user-access";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadShortcutVisibility } from "@/lib/mobile/phone-access";
import { PHONE_SHORTCUTS } from "@/lib/mobile/shortcuts";
import { createServiceClient } from "@/lib/supabase/service";

export default async function MobileShortcutsPage() {
  const { permissions, venue } = await getMobilePageContext();

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const [data, visibility] = await Promise.all([
    listMobileAccessMatrix(),
    loadShortcutVisibility(createServiceClient(), venue.id),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <ModulePageTitle>Shortcuts</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Shortcut tiles on the phone&apos;s welcome screen at {venue.name}. Choose a
          shortcut, then give employees access to it.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <MobileShortcutsClient
        shortcuts={PHONE_SHORTCUTS}
        initialVisibility={visibility}
        rows={[...data.active, ...data.external]}
        venueId={data.venueId}
        canEdit={data.canEdit}
      />
    </div>
  );
}
