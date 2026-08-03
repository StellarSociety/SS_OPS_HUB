import { WorkDriveConnectionPanel } from "@/components/hr/workdrive-connection-panel";
import { getWorkDriveStoreForUi } from "@/lib/actions/hr-workdrive";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ connectionId: string }> };

/** Connection OAuth panel — only mounted on this route. */
export default async function SettingsDriveConnectionPage({ params }: Props) {
  const { connectionId } = await params;
  const { connections } = await getWorkDriveStoreForUi();
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) notFound();

  return <WorkDriveConnectionPanel connection={connection} mode="edit" />;
}
