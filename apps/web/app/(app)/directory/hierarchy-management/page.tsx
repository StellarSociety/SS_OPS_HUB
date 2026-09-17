import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { DirectoryHierarchyBoard } from "@/components/directory/directory-hierarchy-board";
import {
  canAccessDirectoryHierarchyManagement,
  canEditDirectoryHierarchy,
} from "@/lib/directory/permissions";
import { getDirectoryPage } from "@/lib/directory/page-context";
import {
  loadDirectoryHierarchy,
  loadDirectoryPositions,
  loadDirectoryStaffPay,
} from "@/lib/directory/store";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
  type HrSalaryDefaults,
} from "@/lib/hr/types";

export default async function DirectoryHierarchyManagementPage() {
  const { venue, permissions, staff, supabase } = await getDirectoryPage();

  if (!canAccessDirectoryHierarchyManagement(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const [roots, salaryDefaults] = await Promise.all([
    loadDirectoryHierarchy(supabase, venue, staff, { includeHires: true }),
    getHrVenueSetting<HrSalaryDefaults>(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.salaryDefaults,
      DEFAULT_HR_SALARY_DEFAULTS,
    ),
  ]);

  const payByStaffId = await loadDirectoryStaffPay(supabase, venue, staff, {
    basic: salaryDefaults.basicPct,
    accom: salaryDefaults.accomPct,
    transp: salaryDefaults.transpPct,
  });
  const positions = await loadDirectoryPositions(
    supabase,
    venue,
    staff,
    payByStaffId,
  );

  return (
    <DirectoryHierarchyBoard
      staff={staff}
      roots={roots}
      canEdit={
        canEditDirectoryHierarchy(permissions, venue.id) ||
        canAccessDirectoryHierarchyManagement(permissions, venue.id)
      }
      variant="management"
      payByStaffId={payByStaffId}
      positions={positions}
    />
  );
}
