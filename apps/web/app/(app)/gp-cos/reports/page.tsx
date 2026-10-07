import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { Card } from "@/components/ui/card";
import { getCosPageContext, canViewCos } from "@/lib/sales/cos-page-context";

export default async function CosReportsPage() {
  const { venue, permissions } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>GP &amp; COS — Reports</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Consolidated COS reporting — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <Card className="p-10 text-center">
        <h2 className="font-serif text-xl text-[#3D421F]">Reports coming next</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-black/55">
          Revenue, food &amp; beverage cost, COS, purchases, stock, adjustments,
          gross profit, and target-vs-actual reports will appear here once cost
          runs are in place.
        </p>
      </Card>
    </div>
  );
}
