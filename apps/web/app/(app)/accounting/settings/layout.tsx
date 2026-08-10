import { ModulePageTitle } from "@/components/layout/module-page-title";
import { AccountingSettingsSubNav } from "@/components/accounting/accounting-settings-sub-nav";
import {
  canAccessAccountingSettings,
  canAdminAccountingSettings,
} from "@/lib/accounting/permissions";
import { getAccountingPageContext } from "@/lib/accounting/page-context";

export default async function AccountingSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getAccountingPageContext();

  if (!canAccessAccountingSettings(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Accounting settings for this venue.
        </p>
      </div>
    );
  }

  const canEdit = canAdminAccountingSettings(permissions, venue.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Accounting Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Legal entities, chart of accounts, dimensions, and posting defaults
          for {venue.name}.
          {!canEdit
            ? " You can view these settings; admin access is required to edit."
            : null}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <AccountingSettingsSubNav />
      {children}
    </div>
  );
}
