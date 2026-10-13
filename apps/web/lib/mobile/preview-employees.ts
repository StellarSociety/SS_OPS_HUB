import { createServiceClient } from "@/lib/supabase/service";

export type MobilePreviewEmployee = {
  id: string;
  /** Empty for external / org-chart-only people — they have no employee number. */
  empNo: string;
  fullName: string;
  external: boolean;
};

export async function loadMobilePreviewEmployees(
  venueId: string,
): Promise<MobilePreviewEmployee[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("staff")
    .select("id, emp_no, full_name, org_chart_only")
    .eq("home_venue_id", venueId)
    .order("emp_no");

  if (error) {
    console.error("[mobile] loadMobilePreviewEmployees:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      empNo: row.org_chart_only ? "" : String(row.emp_no ?? "").trim(),
      fullName: String(row.full_name ?? "").trim(),
      external: Boolean(row.org_chart_only),
    }))
    .filter((row) => row.id && row.fullName);
}
