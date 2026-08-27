import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_FORM_INTRO,
  DEFAULT_FORM_TITLE,
  DEFAULT_PROMOTIONS_HEADING,
  DEFAULT_QUESTIONS,
  DEFAULT_THANK_YOU,
  type GuestFeedbackPromotion,
  type GuestFeedbackQuestion,
  type GuestFeedbackQuestionType,
  type GuestFeedbackSettings,
} from "./types";

type Client = SupabaseClient;

const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newShortCode(length = 4): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SHORT_CODE_ALPHABET[bytes[i]! % SHORT_CODE_ALPHABET.length];
  }
  return code;
}

function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function asSettings(row: Record<string, unknown>): GuestFeedbackSettings {
  return {
    venue_id: String(row.venue_id),
    public_code: String(row.public_code),
    enabled: Boolean(row.enabled ?? true),
    form_title: String(row.form_title ?? DEFAULT_FORM_TITLE),
    form_intro: String(row.form_intro ?? DEFAULT_FORM_INTRO),
    thank_you_message: String(row.thank_you_message ?? DEFAULT_THANK_YOU),
    promotions_heading: String(
      row.promotions_heading ?? DEFAULT_PROMOTIONS_HEADING,
    ),
    promotions_mark_url: row.promotions_mark_url
      ? String(row.promotions_mark_url)
      : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asQuestion(row: Record<string, unknown>): GuestFeedbackQuestion {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    question_key: String(row.question_key),
    label: String(row.label),
    helper_text: row.helper_text ? String(row.helper_text) : null,
    question_type: String(row.question_type) as GuestFeedbackQuestionType,
    required: Boolean(row.required),
    enabled: Boolean(row.enabled ?? true),
    choices: asTextArray(row.choices),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asPromotion(row: Record<string, unknown>): GuestFeedbackPromotion {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    value_label: row.value_label ? String(row.value_label) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    starts_on: row.starts_on ? String(row.starts_on) : null,
    ends_on: row.ends_on ? String(row.ends_on) : null,
    visible: Boolean(row.visible ?? true),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function uniqueShortCode(client: Client): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newShortCode();
    const { data, error } = await client
      .from("guest_feedback_settings")
      .select("venue_id")
      .ilike("public_code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return code;
  }
  return newShortCode(6);
}

async function seedQuestions(
  client: Client,
  venueId: string,
): Promise<GuestFeedbackQuestion[]> {
  const { data, error } = await client
    .from("guest_feedback_questions")
    .insert(
      DEFAULT_QUESTIONS.map((question) => ({
        venue_id: venueId,
        question_key: question.question_key,
        label: question.label,
        helper_text: question.helper_text,
        question_type: question.question_type,
        required: question.required,
        enabled: true,
        sort_order: question.sort_order,
      })),
    )
    .select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => asQuestion(row as Record<string, unknown>));
}

export async function ensureGuestSource(
  client: Client,
  venueId: string,
): Promise<string> {
  const { data: existing, error: readError } = await client
    .from("sentiment_review_sources")
    .select("id")
    .eq("venue_id", venueId)
    .eq("channel", "guest")
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.id) return String(existing.id);

  const { data, error } = await client
    .from("sentiment_review_sources")
    .insert({
      venue_id: venueId,
      channel: "guest",
      label: "Guest feedback",
      status: "connected",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function ensureGuestFeedbackDefaults(
  client: Client,
  venueId: string,
): Promise<GuestFeedbackSettings> {
  await ensureGuestSource(client, venueId);

  const { data: existing, error: readError } = await client
    .from("guest_feedback_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  let settings: GuestFeedbackSettings;
  if (existing) {
    settings = asSettings(existing as Record<string, unknown>);
  } else {
    const code = await uniqueShortCode(client);
    const { data, error } = await client
      .from("guest_feedback_settings")
      .insert({
        venue_id: venueId,
        public_code: code,
        enabled: true,
        form_title: DEFAULT_FORM_TITLE,
        form_intro: DEFAULT_FORM_INTRO,
        thank_you_message: DEFAULT_THANK_YOU,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    settings = asSettings(data as Record<string, unknown>);
  }

  const questions = await listQuestions(client, venueId);
  if (questions.length === 0) {
    await seedQuestions(client, venueId);
  } else {
    const existingKeys = new Set(questions.map((question) => question.question_key));
    const missing = DEFAULT_QUESTIONS.filter(
      (question) => !existingKeys.has(question.question_key),
    );
    if (missing.length > 0) {
      const { error } = await client.from("guest_feedback_questions").insert(
        missing.map((question) => ({
          venue_id: venueId,
          question_key: question.question_key,
          label: question.label,
          helper_text: question.helper_text,
          question_type: question.question_type,
          required: question.required,
          enabled: true,
          sort_order: question.sort_order,
        })),
      );
      if (error) throw new Error(error.message);
    }
  }

  return settings;
}

export async function getSettings(
  client: Client,
  venueId: string,
): Promise<GuestFeedbackSettings | null> {
  const { data, error } = await client
    .from("guest_feedback_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asSettings(data as Record<string, unknown>) : null;
}

export async function getSettingsByCode(
  client: Client,
  code: string,
): Promise<GuestFeedbackSettings | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const { data, error } = await client
    .from("guest_feedback_settings")
    .select("*")
    .ilike("public_code", trimmed)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return asSettings(data as Record<string, unknown>);

  const { data: venue, error: venueError } = await client
    .from("venues")
    .select("id")
    .eq("slug", trimmed.toLowerCase())
    .maybeSingle();
  if (venueError) throw new Error(venueError.message);
  if (!venue?.id) return null;
  return getSettings(client, String(venue.id));
}

export async function updateSettings(
  client: Client,
  venueId: string,
  values: Partial<
    Pick<
      GuestFeedbackSettings,
      "enabled" | "form_title" | "form_intro" | "thank_you_message" | "public_code" | "promotions_heading" | "promotions_mark_url"
    >
  >,
): Promise<GuestFeedbackSettings> {
  const { data, error } = await client
    .from("guest_feedback_settings")
    .update(values)
    .eq("venue_id", venueId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asSettings(data as Record<string, unknown>);
}

export async function rotatePublicCode(
  client: Client,
  venueId: string,
): Promise<GuestFeedbackSettings> {
  const code = await uniqueShortCode(client);
  return updateSettings(client, venueId, { public_code: code });
}

export async function listQuestions(
  client: Client,
  venueId: string,
): Promise<GuestFeedbackQuestion[]> {
  const { data, error } = await client
    .from("guest_feedback_questions")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => asQuestion(row as Record<string, unknown>));
}

export async function upsertQuestion(
  client: Client,
  values: {
    id?: string;
    venue_id: string;
    question_key: string;
    label: string;
    helper_text: string | null;
    question_type: GuestFeedbackQuestionType;
    required: boolean;
    enabled: boolean;
    choices: string[];
    sort_order: number;
  },
): Promise<GuestFeedbackQuestion> {
  if (values.id) {
    const { data, error } = await client
      .from("guest_feedback_questions")
      .update({
        label: values.label,
        helper_text: values.helper_text,
        question_type: values.question_type,
        required: values.required,
        enabled: values.enabled,
        choices: values.choices,
        sort_order: values.sort_order,
      })
      .eq("id", values.id)
      .eq("venue_id", values.venue_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return asQuestion(data as Record<string, unknown>);
  }

  const { data, error } = await client
    .from("guest_feedback_questions")
    .insert({
      venue_id: values.venue_id,
      question_key: values.question_key,
      label: values.label,
      helper_text: values.helper_text,
      question_type: values.question_type,
      required: values.required,
      enabled: values.enabled,
      choices: values.choices,
      sort_order: values.sort_order,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asQuestion(data as Record<string, unknown>);
}

export async function deleteQuestion(
  client: Client,
  venueId: string,
  questionId: string,
): Promise<void> {
  const { error } = await client
    .from("guest_feedback_questions")
    .delete()
    .eq("id", questionId)
    .eq("venue_id", venueId);
  if (error) throw new Error(error.message);
}

export async function listPromotions(
  client: Client,
  venueId: string,
): Promise<GuestFeedbackPromotion[]> {
  const { data, error } = await client
    .from("guest_feedback_promotions")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => asPromotion(row as Record<string, unknown>));
}

export async function upsertPromotion(
  client: Client,
  values: {
    id?: string;
    venue_id: string;
    title: string;
    description: string | null;
    value_label: string | null;
    image_url?: string | null;
    starts_on: string | null;
    ends_on: string | null;
    visible: boolean;
    sort_order: number;
  },
): Promise<GuestFeedbackPromotion> {
  if (values.id) {
    const payload: Record<string, unknown> = {
      title: values.title,
      description: values.description,
      value_label: values.value_label,
      starts_on: values.starts_on,
      ends_on: values.ends_on,
      visible: values.visible,
      sort_order: values.sort_order,
    };
    if (values.image_url !== undefined) payload.image_url = values.image_url;
    const { data, error } = await client
      .from("guest_feedback_promotions")
      .update(payload)
      .eq("id", values.id)
      .eq("venue_id", values.venue_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return asPromotion(data as Record<string, unknown>);
  }

  const { data, error } = await client
    .from("guest_feedback_promotions")
    .insert({
      venue_id: values.venue_id,
      title: values.title,
      description: values.description,
      value_label: values.value_label,
      image_url: values.image_url ?? null,
      starts_on: values.starts_on,
      ends_on: values.ends_on,
      visible: values.visible,
      sort_order: values.sort_order,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asPromotion(data as Record<string, unknown>);
}

export async function deletePromotion(
  client: Client,
  venueId: string,
  promotionId: string,
): Promise<GuestFeedbackPromotion | null> {
  const { data, error } = await client
    .from("guest_feedback_promotions")
    .delete()
    .eq("id", promotionId)
    .eq("venue_id", venueId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asPromotion(data as Record<string, unknown>) : null;
}

export async function setPromotionVisible(
  client: Client,
  venueId: string,
  promotionId: string,
  visible: boolean,
): Promise<void> {
  const { error } = await client
    .from("guest_feedback_promotions")
    .update({ visible })
    .eq("id", promotionId)
    .eq("venue_id", venueId);
  if (error) throw new Error(error.message);
}

export async function reorderPromotions(
  client: Client,
  venueId: string,
  orderedIds: string[],
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      client
        .from("guest_feedback_promotions")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", id)
        .eq("venue_id", venueId),
    ),
  );
  const firstError = results.find((row) => row.error)?.error;
  if (firstError) throw new Error(firstError.message);
}
