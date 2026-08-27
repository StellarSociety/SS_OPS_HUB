import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { GuestsTable } from "@/components/guests-intel/guests-table";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessGuests } from "@/lib/guests-intel/permissions";
import { getGuestsIntelGuestsPage } from "@/lib/guests-intel/page-context";

export default async function GuestsIntelGuestsPage() {
  const { venue, permissions, guests } = await getGuestsIntelGuestsPage();

  if (!canAccessGuests(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Guests</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Guest profiles collected in the hub or through the public form.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <GuestsTable guests={guests} />
    </div>
  );
}
