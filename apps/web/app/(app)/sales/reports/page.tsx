import { ModulePageTitle } from "@/components/layout/module-page-title";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesReportsPage() {
  await getSalesPageContext();

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Reports</ModulePageTitle>
        <hr className="mt-4 border-black/10" />
      </div>
    </div>
  );
}
