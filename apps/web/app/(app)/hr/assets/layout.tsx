import { AssetsShell } from "@/components/hr/assets-shell";
import { canAccessAssets } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrAssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessAssets(permissions, venue.id)) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-black/60">
          You do not have permission to view assets.
        </p>
      </div>
    );
  }

  return <AssetsShell>{children}</AssetsShell>;
}
