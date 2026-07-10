export type VenueTenderStatus = "active" | "inactive";

export type VenueTender = {
  id: string;
  venue_id: string;
  name: string;
  status: VenueTenderStatus;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const VENUE_TENDER_STATUS_LABELS: Record<VenueTenderStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};
