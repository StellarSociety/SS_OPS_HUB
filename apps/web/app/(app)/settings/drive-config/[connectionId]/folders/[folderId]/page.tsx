import { notFound, redirect } from "next/navigation";
import { WorkDriveFolderPanel } from "@/components/hr/workdrive-folder-panel";
import { getWorkDriveStoreForUi } from "@/lib/actions/hr-workdrive";
import { scopedPath } from "@/lib/venue/active-venue";

type Props = {
  params: Promise<{ connectionId: string; folderId: string }>;
};

/** Folder storage panel — only mounted on this route. */
export default async function SettingsDriveFolderPage({ params }: Props) {
  const { connectionId, folderId } = await params;
  const { connections } = await getWorkDriveStoreForUi();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) {
    redirect(await scopedPath("/settings/drive-config"));
  }

  const folder = connection.folders.find((f) => f.id === folderId);
  if (!folder) {
    if (connection.folders[0]) {
      redirect(
        await scopedPath(
          `/settings/drive-config/${connection.id}/folders/${connection.folders[0].id}`,
        ),
      );
    }
    notFound();
  }

  return (
    <WorkDriveFolderPanel
      connectionId={connection.id}
      folder={folder}
      mode="edit"
    />
  );
}
