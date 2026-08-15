import { CommunicationsShell } from "@/components/hr/communications-shell";
import { canViewStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrCommunicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canViewStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to view communications for this venue.
      </p>
    );
  }

  return <CommunicationsShell>{children}</CommunicationsShell>;
}
