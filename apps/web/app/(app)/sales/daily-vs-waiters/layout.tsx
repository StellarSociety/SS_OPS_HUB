import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { DailyVsWaitersSubNav } from "@/components/sales/daily-vs-waiters-sub-nav";
import { canAccessDailyVsWaiters } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function DailyVsWaitersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSalesPageContext();

  if (!canAccessDailyVsWaiters(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Verification</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Reconcile daily sales with waiter totals — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <DailyVsWaitersSubNav />

      {children}
    </div>
  );
}
