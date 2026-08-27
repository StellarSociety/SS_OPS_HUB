export const GUESTS_INTEL_MODULE_KEY = "guests_intel" as const;

export const GUESTS_INTEL_FEATURES = {
  overview: "overview",
  collect: "collect",
  guests: "guests",
  rewards: "rewards",
  redeem: "redeem",
  settings: "settings",
} as const;

export const GUEST_ALLERGENS = [
  "Gluten",
  "Dairy",
  "Eggs",
  "Fish",
  "Shellfish",
  "Molluscs",
  "Peanuts",
  "Tree nuts",
  "Soy",
  "Sesame",
  "Mustard",
  "Celery",
  "Sulphites",
  "Lupin",
] as const;

export const GUEST_OTHER_DIETS = [
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Halal",
  "Kosher",
  "Gluten-free",
  "Dairy-free",
  "Lactose-free",
  "Keto",
  "Low-carb",
  "Low-sodium",
  "Low spice",
  "No pork",
  "No alcohol",
  "Diabetic-friendly",
] as const;

export const MONTH_DAY_MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

export const REWARD_KINDS = [
  "promotion",
  "voucher",
  "discount",
  "complimentary",
] as const;

export type RewardKind = (typeof REWARD_KINDS)[number];

export const REWARD_KIND_LABELS: Record<RewardKind, string> = {
  promotion: "Promotion",
  voucher: "Voucher",
  discount: "Discount",
  complimentary: "Complementary",
};

export const ISSUE_STATUSES = ["issued", "redeemed", "expired", "void"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const GUEST_SOURCES = ["hub", "public"] as const;
export type GuestSource = (typeof GUEST_SOURCES)[number];

export const DEFAULT_FROM_EMAIL = "reservations@orillarestaurant.com";
export const DEFAULT_FROM_NAME = "Orilla Reservations";

export const DEFAULT_FORM_TITLE = "Tell us a little about you";
export const DEFAULT_FORM_INTRO =
  "Share your details and we’ll send you a pass you can redeem on your next visit.";
export const DEFAULT_THANK_YOU =
  "Thank you. Screenshot the QR code below and keep it on your phone. We’ve also sent it to your email.";
export const DEFAULT_EMAIL_SUBJECT = "Your {{venue}} guest pass";
export const DEFAULT_VALID_DAYS = 90;

export type GuestsIntelSettings = {
  venue_id: string;
  public_token: string;
  from_email: string;
  from_name: string;
  form_title: string;
  form_intro: string;
  thank_you_message: string;
  email_subject: string;
  default_reward_id: string | null;
  public_form_enabled: boolean;
  valid_days: number;
  created_at: string;
  updated_at: string;
};

export type GuestsIntelReward = {
  id: string;
  venue_id: string;
  kind: RewardKind;
  title: string;
  description: string | null;
  value_label: string | null;
  terms: string | null;
  valid_days: number | null;
  active: boolean;
  archived_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type GuestsIntelGuest = {
  id: string;
  venue_id: string;
  source: GuestSource;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  visit_date: string | null;
  birth_anniversary: string | null;
  allergens: string[];
  other_diets: string[];
  notes: string | null;
  marketing_opt_in: boolean;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GuestsIntelIssue = {
  id: string;
  venue_id: string;
  guest_id: string;
  reward_id: string;
  code: string;
  status: IssueStatus;
  issued_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  created_at: string;
  updated_at: string;
};

export type GuestsIntelGuestRow = GuestsIntelGuest & {
  latest_issue: GuestsIntelIssue | null;
  reward_title: string | null;
  reward_kind: RewardKind | null;
  reward_value_label: string | null;
};

export type GuestIntakeInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthAnniversary: string;
  allergens: string[];
  otherDiets: string[];
  notes: string;
  marketingOptIn: boolean;
  rewardId: string;
};

export type IssuedPassView = {
  guestId: string;
  issueId: string;
  code: string;
  firstName: string;
  lastName: string | null;
  email: string;
  rewardTitle: string;
  rewardKind: RewardKind;
  rewardValueLabel: string | null;
  rewardDescription: string | null;
  terms: string | null;
  expiresAt: string | null;
  status: IssueStatus;
  qrSvg: string;
  passPath: string;
  emailSent: boolean;
  emailError: string | null;
};

export const DEFAULT_REWARDS: {
  kind: RewardKind;
  title: string;
  description: string;
  value_label: string;
  sort_order: number;
}[] = [
  {
    kind: "complimentary",
    title: "Welcome drink",
    description: "A complementary welcome drink on us.",
    value_label: "1 complimentary drink",
    sort_order: 10,
  },
  {
    kind: "discount",
    title: "10% off food",
    description: "Ten percent off food on your next visit.",
    value_label: "10% off food",
    sort_order: 20,
  },
  {
    kind: "complimentary",
    title: "Complementary dessert",
    description: "A complementary dessert for the table.",
    value_label: "1 complimentary dessert",
    sort_order: 30,
  },
];

export function guestFormPath(token: string): string {
  return `/g/${encodeURIComponent(token)}`;
}

export function guestPassPath(code: string): string {
  return `/g/r/${encodeURIComponent(code)}`;
}

export function guestDisplayName(guest: {
  first_name: string;
  last_name: string | null;
}): string {
  return [guest.first_name, guest.last_name].filter(Boolean).join(" ").trim();
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Days in a month, using a leap year so 29 February is allowed. */
export function daysInMonth(month: number): number {
  return new Date(2024, month, 0).getDate();
}

/** Stored as MM-DD, e.g. 03-15. */
export function isMonthDay(value: string): boolean {
  const match = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return day >= 1 && day <= daysInMonth(month);
}

export function formatMonthDay(value: string | null | undefined): string {
  if (!value || !isMonthDay(value)) return "";
  const [month, day] = value.split("-");
  const label = MONTH_DAY_MONTHS.find((item) => item.value === month)?.label;
  return label ? `${Number(day)} ${label}` : value;
}

export function sanitizeGuestChoice(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 60) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '&/+.-]{0,59}$/u.test(trimmed)) return null;
  return trimmed;
}

export function parseGuestChoices(values: FormDataEntryValue[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = sanitizeGuestChoice(String(raw));
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 20) break;
  }
  return out;
}

export function formatIssueStatus(status: IssueStatus): string {
  if (status === "issued") return "Ready to redeem";
  if (status === "redeemed") return "Redeemed";
  if (status === "expired") return "Expired";
  return "Void";
}

export function applyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    return vars[key] ?? "";
  });
}
