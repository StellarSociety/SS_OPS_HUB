import { AccountingWelcome } from "@/components/accounting/accounting-welcome";
import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessModule } from "@/lib/module-access";
import { ACCOUNTING_MODULE_KEY } from "@/lib/accounting/types";

export default async function AccountingOverviewPage() {
  const { supabase, venue, permissions, user } =
    await getAccountingPageContext();

  if (!canAccessModule(permissions, ACCOUNTING_MODULE_KEY, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Accounting for this venue.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const userName = (profile?.full_name as string | null)?.trim() || null;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <AccountingWelcome venue={venue} userName={userName} />

      <div>
        <ModuleShortcuts basePath="/accounting" ariaLabel="Accounting apps" />
        <hr className="mt-4 border-black/10" />
      </div>
    </div>
  );
}
