export type VenueWaiterStatus = "active" | "inactive";

export type VenueWaiter = {
  id: string;
  venue_id: string;
  name: string;
  position: string;
  status: VenueWaiterStatus;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const VENUE_WAITER_STATUS_LABELS: Record<VenueWaiterStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};
