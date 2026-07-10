import Link from "next/link";
import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";
import { Card } from "@/components/ui/card";

export default function SalesSettingsPage() {
  return (
    <>
      <SalesSettingsSubNav />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <Link href="/sales/settings/tax">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">Sales tax</h2>
            <p className="mt-2 text-sm text-black/60">
              Municipality fees, VAT, service charge, and total tax rate used to
              derive NET sales from gross figures.
            </p>
          </Card>
        </Link>
        <Link href="/sales/settings/waiters">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">Waiters</h2>
            <p className="mt-2 text-sm text-black/60">
              Manage waiter names, positions, and active status for waiter sales
              entry.
            </p>
          </Card>
        </Link>
        <Link href="/sales/settings/tenders">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">Tenders</h2>
            <p className="mt-2 text-sm text-black/60">
              Configure payment tender types shown on the waiter sales entry
              form.
            </p>
          </Card>
        </Link>
        <Link href="/sales/settings/groups-charge">
          <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
            <h2 className="font-serif text-xl text-[#3D421F]">Groups charge</h2>
            <p className="mt-2 text-sm text-black/60">
              Set the groups added service charge percentage used on waiter
              sales entry.
            </p>
          </Card>
        </Link>
      </div>
    </>
  );
}
