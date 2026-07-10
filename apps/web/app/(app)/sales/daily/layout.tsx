import { DailySalesSubNav } from "@/components/sales/daily-sales-sub-nav";
import { canAccessVenueDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesDailyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSalesPageContext();

  if (!canAccessVenueDaily(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Daily Sales for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Daily Sales</h1>
        <p className="mt-1 text-sm text-black/60">
          Venue Daily Sales Record — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <DailySalesSubNav />

      {children}
    </div>
  );
}
