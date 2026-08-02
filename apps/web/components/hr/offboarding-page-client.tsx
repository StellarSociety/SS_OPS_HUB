"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { OffboardingProcessTable } from "@/components/hr/offboarding-process-table";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import type { OffboardingProcess } from "@/lib/hr/offboarding-process";
import type {
  Department,
  EmploymentStatus,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { useRouter } from "next/navigation";

type OffboardingPageClientProps = {
  venueName: string;
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  processes: OffboardingProcess[];
  canStart: boolean;
};

export function OffboardingPageClient({
  venueName,
  staff,
  departments,
  positions,
  statuses,
  processes,
  canStart,
}: OffboardingPageClientProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentProcesses = useMemo(
    () => processes.filter((p) => !p.archivedAt),
    [processes],
  );

  const activeStaffIds = useMemo(
    () =>
      new Set(
        currentProcesses
          .filter(
            (p) => p.status !== "completed" && p.status !== "cancelled",
          )
          .map((p) => p.staffId),
      ),
    [currentProcesses],
  );

  const pickerStaff = useMemo(
    () => staff.filter((s) => !activeStaffIds.has(s.id)),
    [staff, activeStaffIds],
  );

  function handleSelectStaff(member: StaffWithLookups) {
    setPickerOpen(false);
    router.push(
      toScopedHref(
        `/hr/offboarding/start?staffId=${encodeURIComponent(member.id)}`,
        scope,
        slug,
      ),
    );
  }

  function handleOpenProcess(process: OffboardingProcess) {
    router.push(
      toScopedHref(`/hr/offboarding/${process.id}`, scope, slug),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <ModulePageTitle iconClassName="text-rose-600">
            OFF-Boarding
          </ModulePageTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {venueName} staff exit processes
          </p>
        </div>
        {canStart ? (
          <Button type="button" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Start Off-Boarding
          </Button>
        ) : null}
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-base text-[#3D421F]">
            Current processes
          </h2>
          {currentProcesses.length > 0 ? (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-black/50">
              {currentProcesses.length}
            </span>
          ) : null}
        </div>
        <OffboardingProcessTable
          processes={processes}
          onOpenProcess={handleOpenProcess}
          canManage={canStart}
        />
      </section>

      <StaffSearchDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectStaff}
        staff={pickerStaff}
        departments={departments}
        positions={positions}
        statuses={statuses}
      />
    </div>
  );
}
