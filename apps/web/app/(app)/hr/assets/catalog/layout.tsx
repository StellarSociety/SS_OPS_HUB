import { AssetsCatalogSubNav } from "@/components/hr/assets-catalog-sub-nav";

export default function AssetsCatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <AssetsCatalogSubNav />
      {children}
    </div>
  );
}
