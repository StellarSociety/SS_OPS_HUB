import { canAccessSalesModule } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesOverviewPage() {
  const { venue, permissions } = await getSalesPageContext();

  if (!canAccessSalesModule(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Sales &amp; Revenue for this venue.
        </p>
      </div>
    );
  }

  return <div className="mx-auto max-w-6xl" />;
}
