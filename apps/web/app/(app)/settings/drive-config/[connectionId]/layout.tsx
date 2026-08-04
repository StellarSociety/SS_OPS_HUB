import { notFound, redirect } from "next/navigation";
import { DriveConfigShell } from "@/components/settings/drive-config-shell";
import { getWorkDriveStoreForUi } from "@/lib/actions/hr-workdrive";
import { driveConnectionHomePath } from "@/lib/settings/drive-config-paths";
import { scopedPath } from "@/lib/venue/active-venue";

type Props = {
  children: React.ReactNode;
  params: Promise<{ connectionId: string }>;
};

export default async function DriveConnectionLayout({
  children,
  params,
}: Props) {
  const { connectionId } = await params;
  const { connections } = await getWorkDriveStoreForUi();
  const connection = connections.find((c) => c.id === connectionId);

  if (!connection) {
    if (connections[0]) {
      redirect(await scopedPath(driveConnectionHomePath(connections[0])));
    }
    notFound();
  }

  return (
    <DriveConfigShell
      connections={connections}
      activeConnectionId={connection.id}
    >
      {children}
    </DriveConfigShell>
  );
}
