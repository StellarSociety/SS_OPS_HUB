import type { AccessLevel } from "@/lib/role-permissions";

export type UserListRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "disabled";
  staff_id: string | null;
  created_at: string;
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    home_venue_id: string;
    department: { name: string } | null;
    position: { name: string } | null;
    home_venue: { id: string; name: string; slug: string; is_global: boolean } | null;
  } | null;
  permissions: {
    id: string;
    venue_id: string | null;
    module_key: string;
    feature_key: string;
    access_level: AccessLevel;
  }[];
};

export type InviteableStaffRow = {
  id: string;
  emp_no: string;
  full_name: string;
  work_email: string | null;
  personal_email: string | null;
  home_venue_id: string;
  home_venue: { id: string; name: string; slug: string; is_global: boolean };
  department: { name: string } | null;
  position: { name: string } | null;
};

export type PermissionGrantInput = {
  module_key: string;
  feature_key: string;
  access_level: AccessLevel;
  /** null = all venues / group-wide */
  venue_id: string | null;
};

export type VenueModuleRow = {
  id: string;
  venue_id: string;
  module_key: string;
  enabled: boolean;
};
