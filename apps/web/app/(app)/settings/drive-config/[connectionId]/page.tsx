import { redirect } from "next/navigation";
import { getWorkDriveStoreForUi } from "@/lib/actions/hr-workdrive";
import { defaultDriveFolderPath } from "@/lib/settings/drive-config-paths";
import { scopedPath } from "@/lib/venue/active-venue";

type Props = { params: Promise<{ connectionId: string }> };

export default async function SettingsDriveConnectionIndexPage({
  params,
}: Props) {
  const { connectionId } = await params;
  const { connections } = await getWorkDriveStoreForUi();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) {
    redirect(await scopedPath("/settings/drive-config"));
  }
  redirect(await scopedPath(defaultDriveFolderPath(connection)));
}
