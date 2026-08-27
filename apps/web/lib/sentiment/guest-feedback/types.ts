export const GUEST_FEEDBACK_FEATURE = "guest_feedback" as const;

export const GUEST_FEEDBACK_QUESTION_TYPES = [
  "rating",
  "text",
  "long_text",
  "yes_no",
  "choice",
  "name",
  "email",
  "phone",
  "date",
] as const;

export type GuestFeedbackQuestionType =
  (typeof GUEST_FEEDBACK_QUESTION_TYPES)[number];

export const GUEST_FEEDBACK_QUESTION_TYPE_LABELS: Record<
  GuestFeedbackQuestionType,
  string
> = {
  rating: "Star rating",
  text: "Short text",
  long_text: "Long text",
  yes_no: "Yes / No",
  choice: "Multiple choice",
  name: "Name",
  email: "Email",
  phone: "Phone",
  date: "Date",
};

export const GUEST_FEEDBACK_SYSTEM_KEYS = [
  "overall_rating",
  "food_rating",
  "beverages_rating",
  "service_rating",
  "atmosphere_rating",
  "comment",
  "guest_name",
  "guest_phone",
  "guest_email",
  "visit_date",
] as const;

export type GuestFeedbackSystemKey = (typeof GUEST_FEEDBACK_SYSTEM_KEYS)[number];

export const DEFAULT_FORM_TITLE = "How was your visit?";
export const DEFAULT_FORM_INTRO =
  "We'd love to hear about your dining experience.";
export const DEFAULT_THANK_YOU =
  "Thank you — your feedback helps us make every visit better.";
export const DEFAULT_PROMOTIONS_HEADING = "Current promotions";

export const DEFAULT_QUESTIONS: Array<{
  question_key: string;
  label: string;
  helper_text: string | null;
  question_type: GuestFeedbackQuestionType;
  required: boolean;
  sort_order: number;
}> = [
  {
    question_key: "overall_rating",
    label: "Overall experience",
    helper_text: "How was your visit overall?",
    question_type: "rating",
    required: true,
    sort_order: 10,
  },
  {
    question_key: "food_rating",
    label: "Food",
    helper_text: "Quality, taste, and presentation.",
    question_type: "rating",
    required: false,
    sort_order: 20,
  },
  {
    question_key: "beverages_rating",
    label: "Beverages",
    helper_text: "Drinks, cocktails, wine, and coffee.",
    question_type: "rating",
    required: false,
    sort_order: 25,
  },
  {
    question_key: "service_rating",
    label: "Service",
    helper_text: "Warmth, pace, and attention.",
    question_type: "rating",
    required: false,
    sort_order: 30,
  },
  {
    question_key: "atmosphere_rating",
    label: "Atmosphere",
    helper_text: "Ambience, music, and comfort.",
    question_type: "rating",
    required: false,
    sort_order: 40,
  },
  {
    question_key: "comment",
    label: "Tell us more",
    helper_text: "What stood out — or what could we improve?",
    question_type: "long_text",
    required: false,
    sort_order: 50,
  },
  {
    question_key: "guest_name",
    label: "Your name",
    helper_text: null,
    question_type: "name",
    required: false,
    sort_order: 60,
  },
  {
    question_key: "guest_phone",
    label: "Phone number",
    helper_text: null,
    question_type: "phone",
    required: false,
    sort_order: 65,
  },
  {
    question_key: "guest_email",
    label: "Email",
    helper_text: null,
    question_type: "email",
    required: false,
    sort_order: 70,
  },
  {
    question_key: "visit_date",
    label: "When did you visit?",
    helper_text: null,
    question_type: "date",
    required: false,
    sort_order: 80,
  },
];

export type GuestFeedbackSettings = {
  venue_id: string;
  public_code: string;
  enabled: boolean;
  form_title: string;
  form_intro: string;
  thank_you_message: string;
  promotions_heading: string;
  promotions_mark_url: string | null;
  created_at: string;
  updated_at: string;
};

export type GuestFeedbackQuestion = {
  id: string;
  venue_id: string;
  question_key: string;
  label: string;
  helper_text: string | null;
  question_type: GuestFeedbackQuestionType;
  required: boolean;
  enabled: boolean;
  choices: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type GuestFeedbackPromotion = {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  value_label: string | null;
  image_url: string | null;
  starts_on: string | null;
  ends_on: string | null;
  visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const GUEST_FEEDBACK_OUTBOUND_ICONS = [
  "website",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "snapchat",
  "google",
  "tripadvisor",
] as const;

export type GuestFeedbackOutboundIcon =
  (typeof GUEST_FEEDBACK_OUTBOUND_ICONS)[number];

export type GuestFeedbackOutboundLink = {
  key: string;
  label: string;
  href: string;
  icon: GuestFeedbackOutboundIcon;
};

export type GuestFeedbackAnswer = {
  key: string;
  label: string;
  type: GuestFeedbackQuestionType;
  value: string | number | boolean | null;
};

export function guestFeedbackPath(code: string): string {
  return `/f/${encodeURIComponent(code.trim().toLowerCase())}`;
}

export function isSystemQuestionKey(key: string): boolean {
  return (GUEST_FEEDBACK_SYSTEM_KEYS as readonly string[]).includes(key);
}

export function todayIsoInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
    new Date(),
  );
}

export function isPromotionLive(
  promo: GuestFeedbackPromotion,
  todayIso: string = todayIsoInDubai(),
): boolean {
  if (!promo.visible) return false;
  if (promo.starts_on && promo.starts_on > todayIso) return false;
  if (promo.ends_on && promo.ends_on < todayIso) return false;
  return true;
}

export function livePromotions(
  promotions: GuestFeedbackPromotion[],
  todayIso: string = todayIsoInDubai(),
): GuestFeedbackPromotion[] {
  return promotions
    .filter((promo) => isPromotionLive(promo, todayIso))
    .sort((a, b) => a.sort_order - b.sort_order);
}
