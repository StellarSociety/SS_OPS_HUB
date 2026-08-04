import type { HrWorkDriveConnectionPublic } from "@/lib/hr/types";

/** Connection shell with no inner subtab selected (no panel). */
export function driveConnectionHomePath(
  connection: Pick<HrWorkDriveConnectionPublic, "id">,
): string {
  return `/settings/drive-config/${connection.id}`;
}

/** Prefer HR folder, else the first folder under the connection. */
export function defaultDriveFolderPath(
  connection: Pick<HrWorkDriveConnectionPublic, "id" | "folders">,
): string {
  const folder =
    connection.folders.find((f) => f.moduleKey === "hr") ??
    connection.folders[0];
  if (folder) {
    return `/settings/drive-config/${connection.id}/folders/${folder.id}`;
  }
  return `/settings/drive-config/${connection.id}/connection`;
}
