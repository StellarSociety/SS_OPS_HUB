/**
 * HR Settings route hrefs only — safe to import from Server Components.
 * Icon-bearing tab definitions live in the client nav components.
 */

export const HR_SETTINGS_STAFF_DETAILS_HREF = "/hr/settings/staff-details";
export const HR_SETTINGS_ATTENDANCE_HREF = "/hr/settings/attendance";
export const HR_SETTINGS_PAY_HREF = "/hr/settings/pay";
export const HR_SETTINGS_PAY_ADJUSTMENTS_HREF =
  `${HR_SETTINGS_PAY_HREF}/adjustments`;
export const HR_SETTINGS_PAY_APPROVALS_HREF = `${HR_SETTINGS_PAY_HREF}/approvals`;
/** @deprecated Prefer HR_SETTINGS_EMAILS_PAYROLL_HREF */
export const HR_SETTINGS_PAY_APPROVALS_EMAILS_HREF =
  `${HR_SETTINGS_PAY_APPROVALS_HREF}/emails`;
export const HR_SETTINGS_PAY_BENEFITS_HREF = `${HR_SETTINGS_PAY_HREF}/benefits`;
export const HR_SETTINGS_PAY_BENEFITS_GRATUITY_HREF =
  `${HR_SETTINGS_PAY_BENEFITS_HREF}/gratuity`;
export const HR_SETTINGS_PAY_BENEFITS_SERVICE_CHARGE_HREF =
  `${HR_SETTINGS_PAY_BENEFITS_HREF}/service-charge`;
export const HR_SETTINGS_PAY_PAYSLIP_DOCUMENT_HREF =
  `${HR_SETTINGS_PAY_HREF}/payslip-document`;

export const HR_BENEFITS_GRATUITY_HREF = "/hr/benefits/gratuity";
export const HR_BENEFITS_COLLECTIONS_HREF = "/hr/benefits/collections";
export const HR_BENEFITS_SERVICE_CHARGE_HREF = "/hr/benefits/service-charge";
export const HR_SETTINGS_BOARDING_HREF = "/hr/settings/boarding";
export const HR_SETTINGS_SCHEDULE_APPROVAL_HREF =
  "/hr/settings/attendance/schedule-approval";
export const HR_SETTINGS_ATTENDANCE_SCHEDULES_HREF =
  `${HR_SETTINGS_ATTENDANCE_HREF}/working-status`;
export const HR_SETTINGS_ATTENDANCE_ATTENDANCE_HREF =
  `${HR_SETTINGS_ATTENDANCE_HREF}/public-holidays`;
export const HR_SETTINGS_ATTENDANCE_LEAVE_HREF =
  `${HR_SETTINGS_ATTENDANCE_HREF}/leave`;
export const HR_SETTINGS_NOTIFICATIONS_HREF = "/hr/settings/notifications";
export const HR_SETTINGS_DATA_MANAGEMENT_HREF =
  "/hr/settings/data-management";
export const HR_SETTINGS_EMAILS_HREF = "/hr/settings/emails";
export const HR_SETTINGS_EMAILS_CONNECTION_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/connection`;
export const HR_SETTINGS_EMAILS_HEADER_FOOTER_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/header-footer`;
export const HR_SETTINGS_EMAILS_PAYROLL_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/payroll`;
export const HR_SETTINGS_EMAILS_PAYSLIPS_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/payslips`;
export const HR_SETTINGS_EMAILS_BOARDING_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/boarding`;

export const HR_SETTINGS_DEFAULT_HREF =
  `${HR_SETTINGS_STAFF_DETAILS_HREF}/departments` as const;

export const HR_SETTINGS_TAB_HREFS = [
  HR_SETTINGS_STAFF_DETAILS_HREF,
  HR_SETTINGS_ATTENDANCE_HREF,
  HR_SETTINGS_PAY_HREF,
  HR_SETTINGS_BOARDING_HREF,
  HR_SETTINGS_NOTIFICATIONS_HREF,
  HR_SETTINGS_DATA_MANAGEMENT_HREF,
  HR_SETTINGS_EMAILS_HREF,
] as const;
