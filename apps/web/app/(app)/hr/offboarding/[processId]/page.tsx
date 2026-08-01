import { OffboardingProcessEditClient } from "@/components/hr/offboarding-process-edit-client";
import { getOffboardingProcess } from "@/lib/actions/hr-offboarding";
import { canViewStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  listEmploymentStatuses,
  listStaffForVenue,
} from "@/lib/hr/store";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ processId: string }>;
};

export default async function HrOffboardingProcessPage({ params }: PageProps) {
  const { supabase, venue, permissions } = await getHrPageContext();
  const { processId } = await params;

  if (!canViewStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to view offboarding for this venue.
      </p>
    );
  }

  const [staff, employmentStatuses, processResult] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    listEmploymentStatuses(supabase),
    getOffboardingProcess(processId),
  ]);

  if (!processResult.process) {
    notFound();
  }

  return (
    <OffboardingProcessEditClient
      process={processResult.process}
      staff={staff}
      employmentStatuses={employmentStatuses}
    />
  );
}
