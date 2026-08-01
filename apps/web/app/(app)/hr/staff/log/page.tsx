import { ScrollText } from "lucide-react";
import { getHrPageContext } from "@/lib/hr/page-context";

/**
 * Placeholder — employee lifecycle records from hiring through offboarding.
 * Content and workflows to be defined.
 */
export default async function StaffEmployeeLogPage() {
  await getHrPageContext();

  return (
    <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <ScrollText
          className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          Employee log is not set up yet.
        </p>
      </div>
    </div>
  );
}
