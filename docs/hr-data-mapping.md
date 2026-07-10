# HR data mapping — from "HR Master Book.xlsx"

Reference for the HR module schema + import. Source: David's current HR workbook, sheets **STAFF Details** (48 staff) and **DATA** (lookups). Single venue (Orilla), all AED.

## Lookups (from DATA sheet → seed tables)

- **departments** (7): Culinary · Beverages · F&B Service · Receptions & Reservations · Social Media & Marketing · Entertainments · Finance & Accounts · Human Resources
- **positions** — grouped by department, ordered:
  - Culinary: Head Chef, Jr. Sous Chef, Sr. Chef de Partie, Chef de Partie, Demi Chef de Partie, Commis Chef 1/2/3, Commis Trainee, Steward
  - Beverages: Bar Manager, Asst Bar Manager, Head Bartender, Bartender, Bar Back
  - F&B Service: Restaurant Manager, Assistant Manager, Floor Supervisor, Head Waiter, Waiter, F&B Runner
  - Receptions & Reservations: Receptions & Reservations Manager, Hostess
  - Social Media & Marketing: Social Media & Marketing Manager
  - Entertainments: DJ
  - Finance & Accounts: Accountant
  - Human Resources: Human Resources Coordinator
- **employment statuses**: Hiring · ON Board · OFF Board · OUT
- **nationalities** — each with a `fly_home_ticket_value` (AED), e.g. Austria 3000, Colombia 3000, Greece 1500, India 1700, Indonesia 2500, Thailand 2500, Philippines 2500, Nepal 1500, South Africa 1700, Egypt 1300, Turkey 1500, Korea 2500, … (import full list from sheet)

## Staff fields (STAFF Details → `staff` + related tables)

EMP NO format `ORL0001`…`ORL0048`. 47 fields in 8 groups:

**Identity / details:** emp_no, department, status, first_name, last_name, full_name, contact_phone, personal_email, work_email, gender, civil_status, dob, current_age (derive), nationality

**Documents (→ expiry notifications):** passport_no, passport_expiry, eid_no, eid_expiry

**Bank details:** iban, swift_code, bank_name

**Joining & leave:** position, joining_date, termination_date, worked_time (derive), unpaid_leave_days_total, vacations_entitle, vacations_balance

**Salary package (AED):** wage_package, company_accommodation (bool/text), basic_salary_60, accom_all_25, transp_all_15, fly_home_ticket_per_year

**Expenses:** provisional_leave, provisional_eosb, visa_expenses, visa_penalties_paid

**OHC & trainings (dates → expiry notifications; unit costs noted):** ohc_date (230 AED), pic_date (577.5), basic_food_safety_date (57.75), fire_safety_date (105), first_aid_date (126)

**Insurance (→ expiry notifications):** insurance_category, medical_insurance_value, medical_insurance_issue_date, medical_insurance_expiry_date

## Notes for build

- **App user ↔ staff:** every app login maps to exactly one staff record (strict). Link by `work_email`/`personal_email`. `profiles` (auth) references `staff.id`.
- **Home venue vs. access:** `staff.home_venue_id` = one home venue. App **access** is separate (`user_permissions.venue_id`) and can span one/several/all venues — independent of home. See blueprint §5.
- **Venue staff vs. group staff:** a staff record's home is either a real venue (**venue staff**, on that venue's roster) or **Global** (**group staff** — corporate/ownership/multi-venue people like the superadmin, not part of any venue's HR process). A venue's HR roster shows only its venue staff; group staff live at the Global level.
- **Expiry triggers** for HR dashboard + email reminders: passport_expiry, eid_expiry, medical_insurance_expiry_date, and the 5 training dates (define renewal interval per training).
- **Derived fields** (age, worked_time, vacation balances) computed in app, not stored raw.
- **Money** in AED; store numeric, display with currency.
- **Header typos in source** ("STATTUS", "NACIONALITY") — normalize on import.
- **PII:** passport/EID/bank/DOB are sensitive — restrict via permissions + RLS; consider field-level visibility later.
