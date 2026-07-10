import { canAccessCashUp } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesDailySnapPage() {
  const { venue, permissions } = await getSalesPageContext();

  if (!canAccessCashUp(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Daily Snap for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Daily Snap</h1>
        <p className="mt-1 text-sm text-black/60">
          Daily closing snapshot — {venue.name}
        </p>
      </div>
    </div>
  );
}
