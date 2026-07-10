import { WaiterSalesSubNav } from "@/components/sales/waiter-sales-sub-nav";
import { canAccessWaiterDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesWaiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSalesPageContext();

  if (!canAccessWaiterDaily(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Waiter Sales for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Waiter Sales</h1>
        <p className="mt-1 text-sm text-black/60">
          Waiter Daily Sales Record — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <WaiterSalesSubNav />

      {children}
    </div>
  );
}
