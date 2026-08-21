import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessSalesSettings } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSalesPageContext();

  if (!canAccessSalesSettings(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Revenue Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Configuration for {venue.name} — tax rates, waiters, and sales defaults.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {children}
    </div>
  );
}
