import { createServiceClient } from "@/lib/supabase/service";

export type MobilePreviewEmployee = {
  id: string;
  empNo: string;
  fullName: string;
};

export async function loadMobilePreviewEmployees(
  venueId: string,
): Promise<MobilePreviewEmployee[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("staff")
    .select("id, emp_no, full_name")
    .eq("home_venue_id", venueId)
    .order("emp_no");

  if (error) {
    console.error("[mobile] loadMobilePreviewEmployees:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      empNo: String(row.emp_no ?? "").trim(),
      fullName: String(row.full_name ?? "").trim(),
    }))
    .filter((row) => row.id && row.fullName);
}
