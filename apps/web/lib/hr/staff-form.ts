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
  whatsapp: string;
  personal_email: string;
  work_email: string;
  passport_no: string;
  passport_expiry: string;
  eid_no: string;
  eid_expiry: string;
  iban: string;
  swift_code: string;
  bank_name: string;
  wps_employee_id: string;
  department_id: string;
  position_id: string;
  employment_status_id: string;
  joining_date: string;
  termination_date: string;
  termination_type: string;
  contract_kind: string;
  contract_expiry: string;
  eresidence_expiry: string;
  visa_status: string;
  visa_expiry: string;
  probation_duration_value: string;
  probation_duration_unit: string;
  probation_status: string;
  company_accommodation: string;
  wage_package: string;
  ohc_date: string;
  pic_date: string;
  basic_food_safety_date: string;
  fire_safety_date: string;
  first_aid_date: string;
  medical_insurance_expiry_date: string;
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
    whatsapp: "",
    personal_email: "",
    work_email: "",
    passport_no: "",
    passport_expiry: "",
    eid_no: "",
    eid_expiry: "",
    iban: "",
    swift_code: "",
    bank_name: "",
    wps_employee_id: "",
    department_id: "",
    position_id: "",
    employment_status_id: "",
    joining_date: "",
    termination_date: "",
    termination_type: "",
    contract_kind: "",
    contract_expiry: "",
    eresidence_expiry: "",
    visa_status: "",
    visa_expiry: "",
    probation_duration_value: String(DEFAULT_PROBATION_DURATION_VALUE),
    probation_duration_unit: DEFAULT_PROBATION_DURATION_UNIT,
    probation_status: "",
    company_accommodation: "No",
    wage_package: "",
    ohc_date: "",
    pic_date: "",
    basic_food_safety_date: "",
    fire_safety_date: "",
    first_aid_date: "",
    medical_insurance_expiry_date: "",
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
    whatsapp: str(s.whatsapp),
    personal_email: str(s.personal_email),
    work_email: str(s.work_email),
    passport_no: str(s.passport_no),
    passport_expiry: str(s.passport_expiry),
    eid_no: str(s.eid_no),
    eid_expiry: str(s.eid_expiry),
    iban: str(s.iban),
    swift_code: str(s.swift_code),
    bank_name: str(s.bank_name),
    wps_employee_id: str(s.wps_employee_id),
    department_id: str(s.department_id),
    position_id: str(s.position_id),
    employment_status_id: str(s.employment_status_id),
    joining_date: str(s.joining_date),
    termination_date: str(s.termination_date),
    termination_type: str(s.termination_type),
    contract_kind: str(s.contract_kind),
    contract_expiry: str(s.contract_expiry),
    eresidence_expiry: str(s.eresidence_expiry),
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
    ohc_date: str(s.ohc_date),
    pic_date: str(s.pic_date),
    basic_food_safety_date: str(s.basic_food_safety_date),
    fire_safety_date: str(s.fire_safety_date),
    first_aid_date: str(s.first_aid_date),
    medical_insurance_expiry_date: str(s.medical_insurance_expiry_date),
  };
}
