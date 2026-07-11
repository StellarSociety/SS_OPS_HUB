import { DataManagementSubNav } from "@/components/sales/data-management-sub-nav";
import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";

export default function SalesDataManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SalesSettingsSubNav />
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-2xl text-[#3D421F]">Data Management</h2>
          <p className="mt-1 text-sm text-black/60">
            Bulk import historical daily sales, waiter sales, and discounts via Excel
            templates.
          </p>
        </div>
        <DataManagementSubNav />
        {children}
      </div>
    </>
  );
}
