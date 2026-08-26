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
export const HR_BENEFITS_DEDUCTIONS_HREF = "/hr/benefits/deductions";
export const HR_BENEFITS_FLIGHT_TICKET_HREF = "/hr/benefits/flight-ticket";
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
export const HR_SETTINGS_EMAILS_ACKNOWLEDGEMENTS_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/acknowledgements`;
export const HR_SETTINGS_EMAILS_REMINDERS_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/reminders`;
export const HR_SETTINGS_EMAILS_PAY_HREF = `${HR_SETTINGS_EMAILS_HREF}/pay`;
export const HR_SETTINGS_EMAILS_PAYROLL_HREF =
  `${HR_SETTINGS_EMAILS_PAY_HREF}/payroll`;
export const HR_SETTINGS_EMAILS_PAYSLIPS_HREF =
  `${HR_SETTINGS_EMAILS_PAY_HREF}/payslips`;
export const HR_SETTINGS_EMAILS_FINAL_APPROVAL_HREF =
  `${HR_SETTINGS_EMAILS_PAY_HREF}/final-approval`;
export const HR_SETTINGS_EMAILS_ONBOARDING_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/onboarding`;
export const HR_SETTINGS_EMAILS_BOARDING_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/boarding`;
export const HR_SETTINGS_EMAILS_OTHER_HREF =
  `${HR_SETTINGS_EMAILS_HREF}/other`;
export const HR_SETTINGS_EMAILS_OTHER_WORK_ANNIVERSARY_HREF =
  `${HR_SETTINGS_EMAILS_OTHER_HREF}/work-anniversary`;
export const HR_SETTINGS_EMAILS_OTHER_UPDATED_DOCS_HREF =
  `${HR_SETTINGS_EMAILS_OTHER_HREF}/updated-docs-request`;
export const HR_SETTINGS_EMAILS_OTHER_UNIFORM_TERMS_HREF =
  `${HR_SETTINGS_EMAILS_OTHER_HREF}/uniform-terms`;
export const HR_SETTINGS_EMAILS_OTHER_ASSET_TERMS_HREF =
  `${HR_SETTINGS_EMAILS_OTHER_HREF}/asset-terms`;
export const HR_SETTINGS_EMAILS_OTHER_CERTIFICATION_REQUEST_HREF =
  `${HR_SETTINGS_EMAILS_OTHER_HREF}/certification-request`;
export const HR_SETTINGS_EMAILS_OTHER_INSURANCE_REQUEST_HREF =
  `${HR_SETTINGS_EMAILS_OTHER_HREF}/insurance-request`;
export const HR_SETTINGS_EMAILS_OTHER_VISA_REQUEST_HREF =
  `${HR_SETTINGS_EMAILS_OTHER_HREF}/visa-request`;

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
