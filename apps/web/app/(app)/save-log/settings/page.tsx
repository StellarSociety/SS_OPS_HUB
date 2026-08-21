import { LogTypesEditor } from "@/components/save-log/log-types-editor";
import { canAdminSettings } from "@/lib/save-log/permissions";
import { getSaveLogPageContext } from "@/lib/save-log/page-context";
import { listLogTypes } from "@/lib/save-log/store";
import type { SaveLogType } from "@/lib/save-log/types";

export default async function SaveLogSettingsPage() {
  const { supabase, venue, permissions } = await getSaveLogPageContext();
  const types = await listLogTypes(supabase, venue.id, {
    includeArchived: true,
  }).catch(() => [] as SaveLogType[]);

  return (
    <LogTypesEditor
      types={types}
      canEdit={canAdminSettings(permissions, venue.id)}
    />
  );
}
