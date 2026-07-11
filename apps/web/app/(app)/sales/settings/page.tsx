import { SalesSettingsOverview } from "@/components/sales/sales-settings-overview";
import { SalesSettingsSubNav } from "@/components/sales/sales-settings-sub-nav";

export default function SalesSettingsPage() {
  return (
    <>
      <SalesSettingsSubNav />
      <SalesSettingsOverview />
    </>
  );
}
