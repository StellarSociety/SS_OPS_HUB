import {
  loadEmailTransportStore,
  pickDefaultEmailTransport,
} from "@/lib/email/transport";
import {
  computeEmploymentDuration,
  computeSalaryBreakdown,
  computeWorkTime,
  formatAed,
  isInAccommodation,
} from "@/lib/hr/derived";
import {
  countUnpaidAndAbsenceDays,
  currentLeaveYear,
  isoDateOnly,
  resolveAnnualLeaveEvalDate,
} from "@/lib/hr/leave";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import { computeProbation } from "@/lib/hr/probation";
import {
  getHrVenueSetting,
  listStaffScheduleDays,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
  type HrSalaryDefaults,
} from "@/lib/hr/types";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import {
  emptyMobileProfileSections,
  loadEmployeeProfileSections,
  type MobileProfileAssetItem,
  type MobileProfileAssetTerms,
  type MobileProfileDisciplinaryAction,
  type MobileProfilePathEvent,
  type MobileProfileUniformItem,
} from "@/lib/mobile/employee-profile-sections";
import { createServiceClient } from "@/lib/supabase/service";
import { canManageProfileAvatar } from "@/lib/user/can-manage-profile-avatar";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";

export type {
  MobileProfileAssetItem,
  MobileProfileAssetTerms,
  MobileProfileDisciplinaryAction,
  MobileProfilePathEvent,
  MobileProfileUniformItem,
};

export type MobileWelcomeProfile = {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  empNo: string | null;
  department: string | null;
  position: string | null;
  employmentDuration: string | null;
  workTime: string | null;
  employmentStatus: string | null;
  workingStatus: string | null;
  country: string | null;
  countryFlag: string | null;
  dob: string | null;
  gender: string | null;
  civilStatus: string | null;
  phone: string | null;
  whatsapp: string | null;
  personalEmail: string | null;
  workEmail: string | null;
  joiningDate: string | null;
  contractType: string | null;
  probationStatus: string | null;
  probationPeriod: string | null;
  payableSalary: string | null;
  accommodation: string | null;
  hrEmail: string | null;
  pathEvents: MobileProfilePathEvent[];
  disciplinaryActions: MobileProfileDisciplinaryAction[];
  uniforms: MobileProfileUniformItem[];
  assets: MobileProfileAssetItem[];
  assetTerms: MobileProfileAssetTerms | null;
};

type Named = { name?: string | null } | { name?: string | null }[] | null;

type StaffShape = {
  id?: string | null;
  home_venue_id?: string | null;
  photo_url?: string | null;
  emp_no?: string | null;
  full_name?: string | null;
  work_email?: string | null;
  personal_email?: string | null;
  contact_phone?: string | null;
  whatsapp?: string | null;
  dob?: string | null;
  gender?: string | null;
  civil_status?: string | null;
  joining_date?: string | null;
  termination_date?: string | null;
  contract_kind?: string | null;
  probation_duration_value?: number | null;
  probation_duration_unit?: string | null;
  probation_status?: string | null;
  wage_package?: number | string | null;
  company_accommodation?: string | null;
  termination_type?: string | null;
  department?: Named;
  position?: Named;
  employment_status?: Named;
  working_status?: Named;
  nationality?: Named;
};

type ProfileShape = {
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  is_external?: boolean | null;
  staff?: StaffShape | StaffShape[] | null;
} | null;

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function named(value: Named): string | null {
  const row = unwrap(value);
  const name = row?.name?.trim();
  return name || null;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

const STAFF_FIELDS = `
    id,
    home_venue_id,
    photo_url,
    emp_no,
    full_name,
    work_email,
    personal_email,
    contact_phone,
    whatsapp,
    dob,
    gender,
    civil_status,
    joining_date,
    termination_date,
    contract_kind,
    probation_duration_value,
    probation_duration_unit,
    probation_status,
    wage_package,
    company_accommodation,
    termination_type
`;

const STAFF_SELECT = `
  email,
  full_name,
  avatar_url,
  is_external,
  staff:staff_id (
    ${STAFF_FIELDS},
    department:department_id ( name ),
    position:position_id ( name ),
    employment_status:employment_status_id ( name ),
    working_status:working_status_id ( name ),
    nationality:nationality_id ( name )
  )
`;

const STAFF_ROW_SELECT = `
  ${STAFF_FIELDS},
  department:departments ( name ),
  position:positions ( name ),
  employment_status:employment_statuses ( name ),
  working_status:working_statuses ( name ),
  nationality:nationalities ( name )
`;

function emptyWelcomeProfile(email = ""): MobileWelcomeProfile {
  return {
    fullName: null,
    email,
    avatarUrl: null,
    empNo: null,
    department: null,
    position: null,
    employmentDuration: null,
    workTime: null,
    employmentStatus: null,
    workingStatus: null,
    country: null,
    countryFlag: null,
    dob: null,
    gender: null,
    civilStatus: null,
    phone: null,
    whatsapp: null,
    personalEmail: null,
    workEmail: null,
    joiningDate: null,
    contractType: null,
    probationStatus: null,
    probationPeriod: null,
    payableSalary: null,
    accommodation: null,
    hrEmail: null,
    pathEvents: [],
    disciplinaryActions: [],
    uniforms: [],
    assets: [],
    assetTerms: null,
  };
}

function tenureEndIso(
  terminationDate: string | null | undefined,
): string | null {
  const term = terminationDate?.trim()?.slice(0, 10) || null;
  if (term && /^\d{4}-\d{2}-\d{2}$/.test(term)) return term;
  const evalDate = resolveAnnualLeaveEvalDate(
    currentLeaveYear(),
    new Date(),
    terminationDate,
  );
  return isoDateOnly(evalDate);
}

async function loadWorkTimeExclusionDays(opts: {
  staffId: string;
  venueId: string;
  joiningDate: string | null | undefined;
  asOfDate: string;
}): Promise<number> {
  const joiningDate = opts.joiningDate?.trim()?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) return 0;
  if (!opts.staffId || !opts.venueId) return 0;

  const days = await listStaffScheduleDays(createServiceClient(), opts.venueId, {
    staffIds: [opts.staffId],
    fromDate: joiningDate,
    toDate: opts.asOfDate,
    labelCodes: ["UPL", "ABS"],
  });

  return countUnpaidAndAbsenceDays({
    joiningDate,
    asOfDate: opts.asOfDate,
    scheduleDays: days,
  }).exclusionDays;
}

async function loadPayableSalary(opts: {
  venueId: string;
  wagePackage: number | string | null | undefined;
  accommodation: string | null | undefined;
}): Promise<string | null> {
  const wage =
    opts.wagePackage == null || opts.wagePackage === ""
      ? null
      : Number(opts.wagePackage);
  if (wage == null || Number.isNaN(wage)) return null;

  const defaults = opts.venueId
    ? await getHrVenueSetting<HrSalaryDefaults>(
        createServiceClient(),
        opts.venueId,
        HR_SETTINGS_KEYS.salaryDefaults,
        DEFAULT_HR_SALARY_DEFAULTS,
      )
    : DEFAULT_HR_SALARY_DEFAULTS;

  const breakdown = computeSalaryBreakdown(
    wage,
    isInAccommodation(opts.accommodation),
    {
      basic: defaults.basicPct,
      accom: defaults.accomPct,
      transp: defaults.transpPct,
    },
  );
  return breakdown.salaryToPay == null ? null : formatAed(breakdown.salaryToPay);
}

async function loadHrContactEmail(venueId: string): Promise<string | null> {
  if (!venueId) return null;
  const store = await loadEmailTransportStore(createServiceClient(), venueId);
  const transport = pickDefaultEmailTransport(store);
  if (!transport) return null;
  const email =
    transport.smtp.fromEmail.trim() ||
    transport.smtp.replyTo.trim() ||
    transport.smtp.username.trim();
  return email || null;
}

function mobileProbationFields(staff: StaffShape | null): {
  status: string | null;
  detail: string | null;
} {
  if (!staff) return { status: null, detail: null };
  const probation = computeProbation({
    joiningDate: staff.joining_date,
    durationValue: staff.probation_duration_value,
    durationUnit: staff.probation_duration_unit,
    probationStatus: staff.probation_status,
    terminationDate: staff.termination_date,
  });
  const parts: string[] = [];
  if (probation.status === "Pending") {
    const remaining = Math.max(0, probation.remainingDays ?? 0);
    parts.push(
      remaining === 1 ? "1 day remaining" : `${remaining} days remaining`,
    );
  }
  if (probation.durationLabel) parts.push(probation.durationLabel);
  return {
    status: probation.status,
    detail: parts.join(" · ") || null,
  };
}

async function welcomeProfileFromStaff(opts: {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  staff: StaffShape | null;
  venueId?: string | null;
}): Promise<MobileWelcomeProfile> {
  const staff = opts.staff;
  const joiningDate = staff?.joining_date ?? null;
  const terminationDate = staff?.termination_date ?? null;
  const asOfDate = tenureEndIso(terminationDate);
  const venueId =
    staff?.home_venue_id?.trim() || opts.venueId?.trim() || "";
  const staffId = staff?.id?.trim() || "";
  const country = nationalityDisplay(named(staff?.nationality ?? null));
  const probation = mobileProbationFields(staff);
  const [exclusionDays, payableSalary, hrEmail, sections] = await Promise.all([
    staffId && venueId && asOfDate
      ? loadWorkTimeExclusionDays({
          staffId,
          venueId,
          joiningDate,
          asOfDate,
        })
      : Promise.resolve(0),
    loadPayableSalary({
      venueId,
      wagePackage: staff?.wage_package,
      accommodation: staff?.company_accommodation,
    }),
    loadHrContactEmail(venueId),
    staffId && venueId
      ? loadEmployeeProfileSections(createServiceClient(), {
          staffId,
          venueId,
          joiningDate,
          terminationDate,
          terminationType: staff?.termination_type ?? null,
          department: named(staff?.department ?? null),
          position: named(staff?.position ?? null),
          wagePackage: staff?.wage_package,
          accommodation: staff?.company_accommodation,
        })
      : Promise.resolve(emptyMobileProfileSections()),
  ]);

  return {
    fullName: opts.fullName,
    email: opts.email,
    avatarUrl: opts.avatarUrl,
    empNo: staff?.emp_no?.trim() || null,
    department: named(staff?.department ?? null),
    position: named(staff?.position ?? null),
    employmentDuration: computeEmploymentDuration(joiningDate, asOfDate),
    workTime: computeWorkTime(joiningDate, asOfDate, exclusionDays),
    employmentStatus: named(staff?.employment_status ?? null),
    workingStatus: named(staff?.working_status ?? null),
    country: country?.label ?? null,
    countryFlag: country?.flag || null,
    dob: text(staff?.dob?.slice(0, 10)),
    gender: text(staff?.gender),
    civilStatus: text(staff?.civil_status),
    phone: text(staff?.contact_phone),
    whatsapp: text(staff?.whatsapp),
    personalEmail: text(staff?.personal_email),
    workEmail: text(staff?.work_email),
    joiningDate: text(joiningDate?.slice(0, 10)),
    contractType: text(staff?.contract_kind),
    probationStatus: probation.status,
    probationPeriod: probation.detail,
    payableSalary,
    accommodation: text(staff?.company_accommodation),
    hrEmail,
    pathEvents: sections.pathEvents,
    disciplinaryActions: sections.disciplinaryActions,
    uniforms: sections.uniforms,
    assets: sections.assets,
    assetTerms: sections.assetTerms,
  };
}

export async function loadMobileWelcomeProfile(opts?: {
  venueId?: string | null;
}): Promise<MobileWelcomeProfile> {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  const empty = emptyWelcomeProfile(user?.email ?? "");

  if (!user) return empty;

  const [{ data, error }, renderVenue] = await Promise.all([
    supabase.from("profiles").select(STAFF_SELECT).eq("id", user.id).maybeSingle(),
    opts?.venueId ? Promise.resolve(null) : getRenderVenue(),
  ]);

  const profile = (error ? null : data) as ProfileShape;
  const staff = unwrap(profile?.staff ?? null);
  const email = profile?.email ?? user.email ?? "";
  const preferStaffPhoto = !canManageProfileAvatar({
    is_external: profile?.is_external,
    email,
    staff: staff ? { emp_no: staff.emp_no } : null,
  });
  const metadata = user.user_metadata as Record<string, unknown> | undefined;

  return welcomeProfileFromStaff({
    fullName: profile?.full_name ?? staff?.full_name ?? null,
    email,
    avatarUrl: resolveAvatarUrl({
      profileAvatarUrl: profile?.avatar_url,
      staffPhotoUrl: staff?.photo_url ?? null,
      preferStaffPhoto,
      userMetadata: metadata,
    }),
    staff,
    venueId: opts?.venueId ?? renderVenue?.id ?? null,
  });
}

export async function loadMobileWelcomeProfileForStaff(
  staffId: string,
  opts?: { venueId?: string | null },
): Promise<MobileWelcomeProfile> {
  const id = staffId.trim();
  if (!id) return emptyWelcomeProfile();

  const service = createServiceClient();
  const [{ data: staffRow }, { data: linked }] = await Promise.all([
    service.from("staff").select(STAFF_ROW_SELECT).eq("id", id).maybeSingle(),
    service
      .from("profiles")
      .select("email, full_name, avatar_url, is_external")
      .eq("staff_id", id)
      .limit(1)
      .maybeSingle(),
  ]);

  const staff = (staffRow ?? null) as StaffShape | null;
  if (!staff) return emptyWelcomeProfile();

  const email =
    linked?.email?.trim() ||
    staff.work_email?.trim() ||
    staff.personal_email?.trim() ||
    "";
  const preferStaffPhoto = !canManageProfileAvatar({
    is_external: linked?.is_external,
    email,
    staff: { emp_no: staff.emp_no },
  });

  return welcomeProfileFromStaff({
    fullName: linked?.full_name?.trim() || staff.full_name?.trim() || null,
    email,
    avatarUrl: resolveAvatarUrl({
      profileAvatarUrl: linked?.avatar_url,
      staffPhotoUrl: staff.photo_url ?? null,
      preferStaffPhoto,
    }),
    staff,
    venueId: opts?.venueId ?? null,
  });
}
