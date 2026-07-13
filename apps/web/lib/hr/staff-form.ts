import { isInAccommodation } from "./derived";
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
  company_accommodation: string;
  wage_package: string;
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
    company_accommodation: "No",
    wage_package: "",
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
    company_accommodation: isInAccommodation(s.company_accommodation)
      ? "Yes"
      : "No",
    wage_package: str(s.wage_package),
  };
}
