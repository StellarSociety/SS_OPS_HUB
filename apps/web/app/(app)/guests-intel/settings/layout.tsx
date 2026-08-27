import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessSettings } from "@/lib/guests-intel/permissions";
import { getGuestsIntelPageContext } from "@/lib/guests-intel/page-context";

export default async function GuestsIntelSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getGuestsIntelPageContext();

  if (!canAccessSettings(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Guests Intel Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Reservations mailbox, public form, and guest pass defaults for{" "}
          {venue.name}.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      {children}
    </div>
  );
}
