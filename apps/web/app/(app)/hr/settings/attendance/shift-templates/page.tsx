import { ShiftTemplatesEditor } from "@/components/hr/shift-templates-editor";
import { LookupSection } from "@/components/hr/lookup-sections";
import { ensureDefaultShiftTemplates } from "@/lib/actions/hr";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups } from "@/lib/hr/permissions";
import { listShiftTemplates } from "@/lib/hr/store";

export default async function HrShiftTemplatesSettingsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (canAdminLookups(permissions, venue.id)) {
    await ensureDefaultShiftTemplates();
  }

  const templates =
    (await listShiftTemplates(supabase, venue.id, { includeInactive: true })) ??
    [];

  return (
    <LookupSection
      title="Shift templates"
      description="Working shift times used when assigning Shift on the Schedules roster. Drag to reorder."
    >
      <ShiftTemplatesEditor templates={templates} />
    </LookupSection>
  );
}
