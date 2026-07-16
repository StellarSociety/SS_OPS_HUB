import { PublicHolidaysEditor } from "@/components/hr/public-holidays-editor";
import { LookupSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listPublicHolidays } from "@/lib/hr/store";

export default async function HrPublicHolidaysSettingsPage() {
  const { supabase, venue } = await getHrPageContext();
  const year = new Date().getFullYear();
  const holidays = await listPublicHolidays(supabase, venue.id);
  const tableReady = holidays !== null;

  return (
    <LookupSection
      title="Public holidays"
      description="Define which calendar days are public holidays for this venue. They highlight purple on Schedules and will drive PH leave allowance (worked → credit; not worked → no credit)."
    >
      {tableReady ? (
        <PublicHolidaysEditor holidays={holidays} initialYear={year} />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Apply the{" "}
          <code className="rounded bg-white/70 px-1">
            hr_public_holidays
          </code>{" "}
          migration, then refresh this page.
        </p>
      )}
    </LookupSection>
  );
}
