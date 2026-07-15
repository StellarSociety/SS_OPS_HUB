import { ScheduleDayLabelsEditor } from "@/components/hr/schedule-day-labels-editor";
import { LookupSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  withFallbackScheduleLabelIds,
} from "@/lib/hr/schedules";
import { listScheduleDayLabels } from "@/lib/hr/store";

export default async function HrScheduleDayLabelsSettingsPage() {
  const { supabase } = await getHrPageContext();
  const fromDb = await listScheduleDayLabels(supabase);
  const usingDefaults = !fromDb || fromDb.length === 0;
  const labels = usingDefaults
    ? withFallbackScheduleLabelIds(DEFAULT_SCHEDULE_DAY_LABELS)
    : fromDb;

  return (
    <LookupSection
      title="Schedule day labels"
      description="Abbreviations, names, and tag colours used on the Schedules roster. Drag to reorder."
    >
      <ScheduleDayLabelsEditor labels={labels} usingDefaults={usingDefaults} />
    </LookupSection>
  );
}
