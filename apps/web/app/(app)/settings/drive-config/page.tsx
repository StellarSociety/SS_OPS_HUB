import { redirect } from "next/navigation";
import { getWorkDriveStoreForUi } from "@/lib/actions/hr-workdrive";
import { defaultDriveFolderPath } from "@/lib/settings/drive-config-paths";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function SettingsDriveConfigIndexPage() {
  const { connections } = await getWorkDriveStoreForUi();
  const first = connections[0];
  if (!first) {
    redirect(await scopedPath("/settings/drive-config/new"));
  }
  redirect(await scopedPath(defaultDriveFolderPath(first)));
}
