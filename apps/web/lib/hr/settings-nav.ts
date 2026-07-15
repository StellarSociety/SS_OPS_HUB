/**
 * HR Settings route hrefs only — safe to import from Server Components.
 * Icon-bearing tab definitions live in the client nav components.
 */

export const HR_SETTINGS_STAFF_DETAILS_HREF = "/hr/settings/staff-details";
export const HR_SETTINGS_ATTENDANCE_HREF = "/hr/settings/attendance";
export const HR_SETTINGS_PAY_HREF = "/hr/settings/pay";
export const HR_SETTINGS_BOARDING_HREF = "/hr/settings/boarding";
export const HR_SETTINGS_NOTIFICATIONS_HREF = "/hr/settings/notifications";
export const HR_SETTINGS_DATA_MANAGEMENT_HREF =
  "/hr/settings/data-management";

export const HR_SETTINGS_DEFAULT_HREF =
  `${HR_SETTINGS_STAFF_DETAILS_HREF}/departments` as const;

export const HR_SETTINGS_TAB_HREFS = [
  HR_SETTINGS_STAFF_DETAILS_HREF,
  HR_SETTINGS_ATTENDANCE_HREF,
  HR_SETTINGS_PAY_HREF,
  HR_SETTINGS_BOARDING_HREF,
  HR_SETTINGS_NOTIFICATIONS_HREF,
  HR_SETTINGS_DATA_MANAGEMENT_HREF,
] as const;
