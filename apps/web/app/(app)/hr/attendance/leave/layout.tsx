import { LeaveSubNav } from "@/components/hr/leave-sub-nav";
import { ModulePageTitle } from "@/components/layout/module-page-title";

export default async function LeaveModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Leave Management</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Balances by calendar year, plus a month calendar of scheduled leave
          with type filters and approval.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <LeaveSubNav />
      {children}
    </div>
  );
}
