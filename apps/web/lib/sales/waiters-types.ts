export type VenueWaiterStatus = "active" | "inactive";

export type VenueWaiter = {
  id: string;
  venue_id: string;
  name: string;
  position: string;
  status: VenueWaiterStatus;
  sort_order: number;
  /** Optional HR staff link for Benefits / tip settlement. */
  staff_id?: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Lean HR staff option for linking waiters — safe for client props. */
export type WaiterStaffOption = {
  id: string;
  full_name: string;
  first_name: string | null;
  emp_no: string;
  position_name: string | null;
  department_name: string | null;
  employment_status_name: string | null;
  terminated?: boolean;
};

export const VENUE_WAITER_STATUS_LABELS: Record<VenueWaiterStatus, string> = {
  active: "Visible",
  inactive: "Hidden",
};
