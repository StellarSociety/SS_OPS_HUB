import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessSettings } from "@/lib/save-log/permissions";
import { getSaveLogPageContext } from "@/lib/save-log/page-context";

export default async function SaveLogSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSaveLogPageContext();

  if (!canAccessSettings(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>SafeLog Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          HACCP log types for {venue.name}.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      {children}
    </div>
  );
}
