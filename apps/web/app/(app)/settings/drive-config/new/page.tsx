import { DriveConfigShell } from "@/components/settings/drive-config-shell";
import { WorkDriveConnectionPanel } from "@/components/hr/workdrive-connection-panel";
import { getWorkDriveStoreForUi } from "@/lib/actions/hr-workdrive";
import { emptyWorkDriveConnection } from "@/lib/hr/workdrive/settings";
import type { HrWorkDriveConnectionPublic } from "@/lib/hr/types";

export default async function SettingsDriveConfigNewConnectionPage() {
  const { connections } = await getWorkDriveStoreForUi();
  const blank = emptyWorkDriveConnection({
    id: "",
    label: "ZOHO WorkDrive",
  });
  const publicBlank: HrWorkDriveConnectionPublic = {
    id: "",
    label: blank.label,
    enabled: blank.enabled,
    region: blank.region,
    clientId: blank.clientId,
    connectionStatus: blank.connectionStatus,
    lastVerifiedAt: blank.lastVerifiedAt,
    lastError: blank.lastError,
    hasClientSecret: false,
    hasRefreshToken: false,
    folders: blank.folders,
    isDefault: false,
  };

  return (
    <DriveConfigShell connections={connections}>
      <WorkDriveConnectionPanel connection={publicBlank} mode="add" />
    </DriveConfigShell>
  );
}
