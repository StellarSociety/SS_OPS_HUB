import { AssetsShell } from "@/components/hr/assets-shell";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { canAccessStaffCompliance } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrAssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessStaffCompliance(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return <AssetsShell>{children}</AssetsShell>;
}
