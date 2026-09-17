export const DIRECTORY_MODULE_KEY = "directory" as const;

export const DIRECTORY_FEATURES = {
  staff: "staff",
  celebrations: "celebrations",
  hierarchy: "hierarchy",
  hierarchy_management: "hierarchy_management",
} as const;

export type DirectoryStaffMember = {
  id: string;
  empNo: string;
  fullName: string;
  photoUrl: string | null;
  departmentName: string | null;
  departmentSortOrder: number | null;
  positionName: string | null;
  positionId: string | null;
  employmentStatusName: string | null;
  nationalityName: string | null;
  dob: string | null;
  joiningDate: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  personalEmail: string | null;
  workEmail: string | null;
};

/** Payable salary shown on Hierarchy Management only — never the wage package. */
export type DirectoryStaffPay = {
  salaryToPay: number | null;
  inAccommodation: boolean;
};

export type DirectoryPositionOption = {
  id: string;
  name: string;
  departmentName: string | null;
  typicalPayable: number | null;
};

export type DirectoryCelebrationKind = "birthday" | "anniversary";

export type DirectoryCelebration = {
  staffId: string;
  kind: DirectoryCelebrationKind;
  /** Occurrence in the visible window, `YYYY-MM-DD`. */
  occurrenceDate: string;
  /** Days from Dubai today (negative = already happened). */
  daysFromToday: number;
  /** Whole years completed on this occurrence (anniversaries only). */
  years: number | null;
};
