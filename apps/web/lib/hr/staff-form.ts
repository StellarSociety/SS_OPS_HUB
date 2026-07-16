import { isInAccommodation } from "./derived";
import {
  DEFAULT_PROBATION_DURATION_UNIT,
  DEFAULT_PROBATION_DURATION_VALUE,
} from "./probation";
import type { StaffWithLookups } from "./types";

/**
 * String-only view of a staff record, shaped for controlled form inputs.
 * Every value maps 1:1 to a named input so `new FormData(form)` still feeds the
 * `createStaff` / `updateStaff` server actions unchanged.
 */
export type StaffFormState = {
  emp_no: string;
  first_name: string;
  last_name: string;
  full_name: string;
  gender: string;
  civil_status: string;
  dob: string;
  nationality_id: string;
  contact_phone: string;
  personal_email: string;
  work_email: string;
  passport_no: string;
  passport_expiry: string;
  eid_no: string;
  eid_expiry: string;
  iban: string;
  swift_code: string;
  bank_name: string;
  department_id: string;
  position_id: string;
  employment_status_id: string;
  joining_date: string;
  termination_date: string;
  contract_kind: string;
  visa_status: string;
  visa_expiry: string;
  probation_duration_value: string;
  probation_duration_unit: string;
  probation_status: string;
  company_accommodation: string;
  wage_package: string;
  /** Public URL of the cropped passport-ratio staff photo. */
  photo_url: string;
};

const str = (v: unknown): string => (v == null ? "" : String(v));

export function emptyStaffForm(empNo: string): StaffFormState {
  return {
    emp_no: empNo,
    first_name: "",
    last_name: "",
    full_name: "",
    gender: "",
    civil_status: "",
    dob: "",
    nationality_id: "",
    contact_phone: "",
    personal_email: "",
    work_email: "",
    passport_no: "",
    passport_expiry: "",
    eid_no: "",
    eid_expiry: "",
    iban: "",
    swift_code: "",
    bank_name: "",
    department_id: "",
    position_id: "",
    employment_status_id: "",
    joining_date: "",
    termination_date: "",
    contract_kind: "",
    visa_status: "",
    visa_expiry: "",
    probation_duration_value: String(DEFAULT_PROBATION_DURATION_VALUE),
    probation_duration_unit: DEFAULT_PROBATION_DURATION_UNIT,
    probation_status: "",
    company_accommodation: "No",
    wage_package: "",
    photo_url: "",
  };
}

export function staffToForm(s: StaffWithLookups): StaffFormState {
  return {
    emp_no: str(s.emp_no),
    first_name: str(s.first_name),
    last_name: str(s.last_name),
    full_name: str(s.full_name),
    gender: str(s.gender),
    civil_status: str(s.civil_status),
    dob: str(s.dob),
    nationality_id: str(s.nationality_id),
    contact_phone: str(s.contact_phone),
    personal_email: str(s.personal_email),
    work_email: str(s.work_email),
    passport_no: str(s.passport_no),
    passport_expiry: str(s.passport_expiry),
    eid_no: str(s.eid_no),
    eid_expiry: str(s.eid_expiry),
    iban: str(s.iban),
    swift_code: str(s.swift_code),
    bank_name: str(s.bank_name),
    department_id: str(s.department_id),
    position_id: str(s.position_id),
    employment_status_id: str(s.employment_status_id),
    joining_date: str(s.joining_date),
    termination_date: str(s.termination_date),
    contract_kind: str(s.contract_kind),
    visa_status: str(s.visa_status),
    visa_expiry: str(s.visa_expiry),
    probation_duration_value: str(s.probation_duration_value) || String(DEFAULT_PROBATION_DURATION_VALUE),
    probation_duration_unit:
      str(s.probation_duration_unit) || DEFAULT_PROBATION_DURATION_UNIT,
    probation_status: str(s.probation_status),
    company_accommodation: isInAccommodation(s.company_accommodation)
      ? "Yes"
      : "No",
    wage_package: str(s.wage_package),
    photo_url: str(s.photo_url),
  };
}
