"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { scoreReview } from "@/lib/sentiment/score-review";
import { ensureGuestSource, getSettingsByCode, listQuestions } from "@/lib/sentiment/guest-feedback/store";
import type {
  GuestFeedbackAnswer,
  GuestFeedbackQuestion,
} from "@/lib/sentiment/guest-feedback/types";

function fail(message: string) {
  return { ok: false as const, error: message };
}

function fieldValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseAnswer(
  question: GuestFeedbackQuestion,
  raw: string,
): GuestFeedbackAnswer | { error: string } {
  if (!raw) {
    if (question.required) {
      return { error: `Please answer: ${question.label}.` };
    }
    return {
      key: question.question_key,
      label: question.label,
      type: question.question_type,
      value: null,
    };
  }

  if (question.question_type === "rating") {
    const rating = Number(raw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { error: `Choose 1–5 stars for ${question.label}.` };
    }
    return {
      key: question.question_key,
      label: question.label,
      type: question.question_type,
      value: rating,
    };
  }

  if (question.question_type === "yes_no") {
    if (raw !== "yes" && raw !== "no") {
      return { error: `Choose yes or no for ${question.label}.` };
    }
    return {
      key: question.question_key,
      label: question.label,
      type: question.question_type,
      value: raw === "yes",
    };
  }

  if (question.question_type === "choice") {
    if (!question.choices.includes(raw)) {
      return { error: `Choose an option for ${question.label}.` };
    }
    return {
      key: question.question_key,
      label: question.label,
      type: question.question_type,
      value: raw,
    };
  }

  if (question.question_type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return { error: "Enter a valid email, or leave it blank." };
    }
  }

  if (question.question_type === "phone") {
    if (!/[0-9]/.test(raw) || raw.length > 32) {
      return { error: "Enter a valid phone number, or leave it blank." };
    }
  }

  if (question.question_type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: `Pick a date for ${question.label}.` };
    }
  }

  return {
    key: question.question_key,
    label: question.label,
    type: question.question_type,
    value: raw.slice(0, question.question_type === "long_text" ? 2000 : 200),
  };
}

function answerText(answers: GuestFeedbackAnswer[], key: string): string | null {
  const match = answers.find((item) => item.key === key);
  if (match == null || match.value == null || match.value === "") return null;
  return String(match.value);
}

function answerNumber(answers: GuestFeedbackAnswer[], key: string): number | null {
  const match = answers.find((item) => item.key === key);
  return typeof match?.value === "number" ? match.value : null;
}

export async function submitPublicGuestFeedback(
  code: string,
  formData: FormData,
) {
  const service = createServiceClient();
  const settings = await getSettingsByCode(service, code);
  if (!settings || !settings.enabled) {
    return fail("This feedback page is closed or the link is no longer valid.");
  }

  const questions = (await listQuestions(service, settings.venue_id)).filter(
    (question) => question.enabled,
  );
  if (questions.length === 0) {
    return fail("This feedback form is not ready yet.");
  }

  const answers: GuestFeedbackAnswer[] = [];
  for (const question of questions) {
    const parsed = parseAnswer(question, fieldValue(formData, question.question_key));
    if ("error" in parsed) return fail(parsed.error);
    answers.push(parsed);
  }

  const rating = answerNumber(answers, "overall_rating");
  const comment = answerText(answers, "comment");
  const authorName = answerText(answers, "guest_name");
  const visitDate = answerText(answers, "visit_date");
  const guestEmail = answerText(answers, "guest_email");
  const guestPhone = answerText(answers, "guest_phone");

  const overallQuestion = questions.find((q) => q.question_key === "overall_rating");
  if (overallQuestion?.required && rating == null) {
    return fail("Please rate your overall experience.");
  }

  const reviewedAt = visitDate
    ? `${visitDate}T12:00:00.000Z`
    : new Date().toISOString();
  const scored = scoreReview({ rating, comment });
  const sourceId = await ensureGuestSource(service, settings.venue_id);
  const externalId = `guest-${crypto.randomUUID()}`;

  const { error } = await service.from("sentiment_reviews").insert({
    venue_id: settings.venue_id,
    source_id: sourceId,
    channel: "guest",
    external_id: externalId,
    author_name: authorName,
    author_photo_url: null,
    rating,
    comment,
    reviewed_at: reviewedAt,
    language: "en",
    review_url: null,
    raw: {
      source: "guest_feedback",
      guest_email: guestEmail,
      guest_phone: guestPhone,
      visit_date: visitDate,
      answers,
    },
    status: "new",
    sentiment_label: scored.label,
    sentiment_score: scored.score,
    sentiment_topics: scored.topics,
    sentiment_analyzed_at: new Date().toISOString(),
  });
  if (error) return fail(error.message);

  return { ok: true as const, thankYou: settings.thank_you_message };
}
