import { redirect } from "next/navigation";
import { WorkDriveFolderWizard } from "@/components/hr/workdrive-folder-wizard";
import { getWorkDriveStoreForUi } from "@/lib/actions/hr-workdrive";
import { emptyWorkDriveFolder } from "@/lib/hr/workdrive/settings";
import { scopedPath } from "@/lib/venue/active-venue";

type Props = { params: Promise<{ connectionId: string }> };

/** Add-folder wizard — only mounted on this route. */
export default async function SettingsDriveFolderNewPage({ params }: Props) {
  const { connectionId } = await params;
  const { connections } = await getWorkDriveStoreForUi();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) {
    redirect(await scopedPath("/settings/drive-config"));
  }

  const seed =
    connection.folders.find((f) => f.moduleKey === "hr") ??
    connection.folders[0];
  const blank = emptyWorkDriveFolder({
    id: "",
    label: "",
    moduleKey: "custom",
    teamFolderName: seed?.teamFolderName ?? "SS-OPS-HUB",
    teamFolderId: seed?.teamFolderId ?? "",
    hrFolderName: "",
    hrFolderId: "",
    employeeDocsFolderId: seed?.employeeDocsFolderId ?? "",
    employeeDocsFolderName:
      seed?.employeeDocsFolderName ?? "Employee Documents",
    employeeFolderTemplate: seed?.employeeFolderTemplate,
    extraFolders: [],
  });

  return (
    <WorkDriveFolderWizard connectionId={connection.id} seed={blank} />
  );
}
