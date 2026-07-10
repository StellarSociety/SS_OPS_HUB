import { DiscountsSubNav } from "@/components/sales/discounts-sub-nav";
import { canAccessDiscounts } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesDiscountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSalesPageContext();

  if (!canAccessDiscounts(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Discounts for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Discounts</h1>
        <p className="mt-1 text-sm text-black/60">
          Daily discount records — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <DiscountsSubNav />

      {children}
    </div>
  );
}
