export type Venue = {
  id: string;
  slug: string;
  name: string;
  is_global: boolean;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  icon_url: string | null;
  favicon_url: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "disabled";
  staff_id: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  venue_id: string | null;
  module_key: string;
  type: string;
  title: string;
  body: string | null;
  entity: string;
  entity_id: string;
  severity: "info" | "warning" | "critical";
  due_date: string | null;
  lead_days: number | null;
  read_at: string | null;
  email_sent_at: string | null;
  dedupe_key: string;
  created_at: string;
};

export type EmploymentStatus = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type WorkingStatus = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type ScheduleDayLabelRow = {
  id: string;
  code: string;
  abbreviation: string;
  name: string;
  bg_color: string;
  text_color: string;
  border_color: string;
  sort_order: number;
  created_at: string;
};

export type HrScheduleDay = {
  id: string;
  venue_id: string;
  staff_id: string;
  emp_no: string;
  work_date: string;
  label_code: string;
  shift_template_id: string | null;
  department_id: string | null;
  notes: string | null;
  source: "manual" | "import" | "system";
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrAttendanceDay = {
  id: string;
  venue_id: string;
  staff_id: string | null;
  emp_no: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  punch_count: number;
  status:
    | "complete"
    | "missing_clock_in"
    | "missing_clock_out"
    | "incomplete"
    | "no_punches";
  approval_status: "pending" | "approved" | "rejected" | "flagged";
  import_batch_id: string | null;
  source: "manual" | "import" | "system";
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrAttendanceImportBatch = {
  id: string;
  venue_id: string;
  filename: string | null;
  row_count: number;
  day_count: number;
  unmatched_emp_nos: string[];
  imported_by: string | null;
  imported_at: string;
  notes: string | null;
};

export type HrShiftTemplate = {
  id: string;
  venue_id: string;
  name: string;
  abbreviation: string;
  start_time: string;
  end_time: string;
  spans_midnight: boolean;
  bg_color: string;
  text_color: string;
  border_color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type HrScheduleWeekSection = {
  id: string;
  venue_id: string;
  department_key: "kitchen" | "bar" | "floor";
  week_start: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HrScheduleSectionAssignment = {
  id: string;
  venue_id: string;
  department_key: "kitchen" | "bar" | "floor";
  week_start: string;
  section_id: string;
  staff_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Nationality = {
  id: string;
  name: string;
  fly_home_ticket_value: number;
  created_at: string;
};

export type Department = {
  id: string;
  venue_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type Position = {
  id: string;
  venue_id: string;
  department_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type Staff = {
  id: string;
  home_venue_id: string;
  emp_no: string;
  department_id: string | null;
  position_id: string | null;
  employment_status_id: string | null;
  working_status_id: string | null;
  nationality_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_phone: string | null;
  personal_email: string | null;
  work_email: string | null;
  gender: string | null;
  civil_status: string | null;
  dob: string | null;
  passport_no: string | null;
  passport_expiry: string | null;
  eid_no: string | null;
  eid_expiry: string | null;
  iban: string | null;
  swift_code: string | null;
  bank_name: string | null;
  joining_date: string | null;
  termination_date: string | null;
  contract_kind: string | null;
  visa_status: string | null;
  visa_expiry: string | null;
  probation_duration_value: number | null;
  probation_duration_unit: string | null;
  probation_status: string | null;
  unpaid_leave_days_total: number | null;
  vacations_entitle: number | null;
  vacations_balance: number | null;
  wage_package: number | null;
  company_accommodation: string | null;
  basic_salary_60: number | null;
  accom_all_25: number | null;
  transp_all_15: number | null;
  fly_home_ticket_per_year: number | null;
  provisional_leave: number | null;
  provisional_eosb: number | null;
  visa_expenses: number | null;
  visa_penalties_paid: number | null;
  ohc_date: string | null;
  pic_date: string | null;
  basic_food_safety_date: string | null;
  fire_safety_date: string | null;
  first_aid_date: string | null;
  insurance_category: string | null;
  medical_insurance_value: number | null;
  medical_insurance_issue_date: string | null;
  medical_insurance_expiry_date: string | null;
  photo_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      venues: {
        Row: Venue;
        Insert: Omit<Venue, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Venue>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "staff_id"> & {
          created_at?: string;
          staff_id?: string | null;
        };
        Update: Partial<Profile>;
      };
      user_permissions: {
        Row: {
          id: string;
          user_id: string;
          venue_id: string | null;
          module_key: string;
          feature_key: string;
          access_level: "admin" | "edit" | "view" | "submit";
          created_at: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          module_key: string | null;
          entity: string | null;
          entity_id: string | null;
          venue_id: string | null;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
          created_at: string;
        };
      };
      employment_statuses: { Row: EmploymentStatus };
      working_statuses: { Row: WorkingStatus };
      schedule_day_labels: { Row: ScheduleDayLabelRow };
      hr_schedule_days: { Row: HrScheduleDay };
      hr_attendance_days: { Row: HrAttendanceDay };
      hr_attendance_import_batches: { Row: HrAttendanceImportBatch };
      hr_shift_templates: { Row: HrShiftTemplate };
      hr_schedule_week_sections: { Row: HrScheduleWeekSection };
      hr_schedule_section_assignments: { Row: HrScheduleSectionAssignment };
      nationalities: { Row: Nationality };
      departments: { Row: Department };
      positions: { Row: Position };
      staff: { Row: Staff };
      notifications: {
        Row: Notification;
        Insert: Omit<
          Notification,
          "id" | "created_at" | "read_at" | "email_sent_at"
        > & {
          id?: string;
          created_at?: string;
          read_at?: string | null;
          email_sent_at?: string | null;
        };
        Update: Partial<Notification>;
      };
      venue_modules: {
        Row: {
          id: string;
          venue_id: string;
          module_key: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          venue_id: string;
          module_key: string;
          enabled?: boolean;
        };
        Update: Partial<{
          enabled: boolean;
        }>;
      };
      app_module_states: {
        Row: {
          module_key: string;
          state: "live" | "coming_soon" | "visible_locked" | "hidden";
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          module_key: string;
          state?: "live" | "coming_soon" | "visible_locked" | "hidden";
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<{
          state: "live" | "coming_soon" | "visible_locked" | "hidden";
          updated_at: string;
          updated_by: string | null;
        }>;
      };
    };
  };
};
