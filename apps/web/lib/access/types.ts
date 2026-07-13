import type { AnyRole } from "@/lib/access/roles";
import type { AccessLevel } from "@/lib/role-permissions";

export type InviteStatus = "pending" | "accepted" | "disabled";

export type ModuleAccessRecord = {
  id: string;
  venue_id: string | null;
  module_key: string;
  role: AnyRole;
  enabled: boolean;
  suspended: boolean;
};

export type UserListRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "disabled";
  staff_id: string | null;
  is_external: boolean;
  login_email_source: "work" | "personal" | "custom" | null;
  invited_at: string | null;
  invite_accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
  staff: {
    id: string;
    emp_no: string;
    first_name: string | null;
    full_name: string;
    work_email: string | null;
    personal_email: string | null;
    home_venue_id: string;
    department: { name: string } | null;
    position: { name: string } | null;
    employment_status: { name: string } | null;
    home_venue: { id: string; name: string; slug: string; is_global: boolean } | null;
  } | null;
  permissions: {
    id: string;
    venue_id: string | null;
    module_key: string;
    feature_key: string;
    access_level: AccessLevel;
  }[];
  moduleAccess: ModuleAccessRecord[];
};

export type InviteableStaffRow = {
  id: string;
  emp_no: string;
  full_name: string;
  first_name: string | null;
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

export type AccessEventRow = {
  id: string;
  user_id: string;
  venue_id: string | null;
  module_key: string | null;
  path: string | null;
  event_type: "login" | "logout" | "module_access" | "page_view";
  created_at: string;
};

export function inviteStatusOf(user: {
  status: "active" | "disabled";
  invite_accepted_at: string | null;
}): InviteStatus {
  if (user.status === "disabled") return "disabled";
  if (!user.invite_accepted_at) return "pending";
  return "accepted";
}
