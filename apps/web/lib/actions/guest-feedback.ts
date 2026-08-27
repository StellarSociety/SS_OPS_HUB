"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  loadEmailChromeForVenue,
  mergeEmailChromeSettings,
  resolveEmailChromeForVenue,
} from "@/lib/hr/email-chrome";
import {
  EMAIL_CHROME_SOCIAL_LINK_KEYS,
  emailChromeSocialFormName,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";
import {
  asUploadBlob,
  convertImageToWebp,
  resolveRasterImageMime,
  uploadBlobMeta,
} from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";
import { canEditGuestFeedback } from "@/lib/sentiment/permissions";
import { SENTIMENT_MODULE_KEY } from "@/lib/sentiment/types";
import {
  deletePromotion,
  deleteQuestion,
  reorderPromotions,
  rotatePublicCode,
  setPromotionVisible,
  updateSettings,
  upsertPromotion,
  upsertQuestion,
} from "@/lib/sentiment/guest-feedback/store";
import {
  GUEST_FEEDBACK_QUESTION_TYPES,
  DEFAULT_PROMOTIONS_HEADING,
  isSystemQuestionKey,
  type GuestFeedbackQuestionType,
} from "@/lib/sentiment/guest-feedback/types";

const PROMO_BUCKET = "guest-feedback";
const PROMO_MAX_BYTES = 5 * 1024 * 1024;

function fail(message: string) {
  return { ok: false as const, error: message };
}

function revalidateGuestFeedback() {
  revalidatePath("/sentiment/guest-feedback", "page");
  revalidatePath("/sentiment/guest-feedback/questionnaire", "page");
  revalidatePath("/sentiment/guest-feedback/simulator", "page");
  revalidatePath("/sentiment/guest-feedback/promotions", "page");
  revalidatePath("/sentiment/guest-feedback/socials", "page");
  revalidatePath("/sentiment/reviews", "page");
  revalidatePath("/sentiment/reviews/guest", "page");
}

type EditorAuth =
  | { error: string }
  | {
      userId: string;
      venueId: string;
      service: ReturnType<typeof createServiceClient>;
    };

async function requireEditor(): Promise<EditorAuth> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };
  if (auth.venue.is_global) {
    return { error: "Open Guest Feedback from a venue, not Global." };
  }
  if (!canEditGuestFeedback(auth.permissions, auth.venue.id)) {
    return { error: "You need Guest Feedback edit access." };
  }
  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

function parseQuestionType(value: string): GuestFeedbackQuestionType | null {
  return GUEST_FEEDBACK_QUESTION_TYPES.includes(
    value as GuestFeedbackQuestionType,
  )
    ? (value as GuestFeedbackQuestionType)
    : null;
}

export async function saveGuestFeedbackSettings(formData: FormData) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);

  const formTitle = String(formData.get("form_title") ?? "").trim();
  const formIntro = String(formData.get("form_intro") ?? "").trim();
  const thankYou = String(formData.get("thank_you_message") ?? "").trim();
  const promotionsHeading = String(formData.get("promotions_heading") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  if (!formTitle) return fail("Add a title for the guest page.");

  try {
    await updateSettings(auth.service, auth.venueId, {
      enabled,
      form_title: formTitle.slice(0, 120),
      form_intro: formIntro.slice(0, 600),
      thank_you_message: thankYou.slice(0, 400),
      promotions_heading: (promotionsHeading || DEFAULT_PROMOTIONS_HEADING).slice(
        0,
        80,
      ),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save.");
  }

  await writeAuditLog({
    actor_id: auth.userId,
    action: "guest_feedback.settings.save",
    module_key: SENTIMENT_MODULE_KEY,
    entity: "guest_feedback_settings",
    entity_id: auth.venueId,
    venue_id: auth.venueId,
  });
  revalidateGuestFeedback();
  return { ok: true as const };
}

export async function rotateGuestFeedbackLink() {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);

  try {
    const settings = await rotatePublicCode(auth.service, auth.venueId);
    await writeAuditLog({
      actor_id: auth.userId,
      action: "guest_feedback.link.rotate",
      module_key: SENTIMENT_MODULE_KEY,
      entity: "guest_feedback_settings",
      entity_id: auth.venueId,
      venue_id: auth.venueId,
      after: { public_code: settings.public_code },
    });
    revalidateGuestFeedback();
    return { ok: true as const, code: settings.public_code };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not rotate the link.");
  }
}

export async function saveGuestFeedbackQuestion(formData: FormData) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const questionKeyRaw = String(formData.get("question_key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const helperText = String(formData.get("helper_text") ?? "").trim();
  const questionType = parseQuestionType(
    String(formData.get("question_type") ?? ""),
  );
  const required = formData.get("required") === "on";
  const enabled = formData.get("enabled") === "on";
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const choices = String(formData.get("choices") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!label) return fail("Add a question label.");
  if (!questionType) return fail("Choose a question type.");
  if (questionType === "choice" && choices.length < 2) {
    return fail("Add at least two choices, one per line.");
  }

  const questionKey =
    questionKeyRaw ||
    `q_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  try {
    await upsertQuestion(auth.service, {
      id,
      venue_id: auth.venueId,
      question_key: questionKey,
      label: label.slice(0, 160),
      helper_text: helperText ? helperText.slice(0, 240) : null,
      question_type: questionType,
      required,
      enabled,
      choices: questionType === "choice" ? choices.slice(0, 12) : [],
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save the question.");
  }

  revalidateGuestFeedback();
  return { ok: true as const };
}

export async function removeGuestFeedbackQuestion(questionId: string) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);
  if (!questionId) return fail("Missing question.");

  const { data, error } = await auth.service
    .from("guest_feedback_questions")
    .select("question_key")
    .eq("id", questionId)
    .eq("venue_id", auth.venueId)
    .maybeSingle();
  if (error) return fail(error.message);
  if (data && isSystemQuestionKey(String(data.question_key))) {
    return fail("Hide this question instead of deleting it.");
  }

  try {
    await deleteQuestion(auth.service, auth.venueId, questionId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not delete.");
  }
  revalidateGuestFeedback();
  return { ok: true as const };
}

async function uploadPromotionImage(
  service: ReturnType<typeof createServiceClient>,
  venueId: string,
  promotionId: string,
  file: Blob,
): Promise<string> {
  const meta = uploadBlobMeta(file);
  const mime = resolveRasterImageMime({ type: meta.type, name: meta.name });
  if (!mime) {
    throw new Error("Use a JPEG, PNG, WebP, GIF, or similar image.");
  }
  if (file.size > PROMO_MAX_BYTES) {
    throw new Error("Keep promotion images under 5 MB.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const { buffer, contentType, extension } = await convertImageToWebp(bytes, {
    maxWidth: 1600,
    maxHeight: 1600,
  });
  const path = `${venueId}/${promotionId}.${extension}`;
  const { error } = await service.storage.from(PROMO_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = service.storage.from(PROMO_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function saveGuestFeedbackPromotion(formData: FormData) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const valueLabel = String(formData.get("value_label") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "").trim() || null;
  const endsOn = String(formData.get("ends_on") ?? "").trim() || null;
  const visible = formData.get("visible") === "on";
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const imageBlob = asUploadBlob(formData.get("image"));

  if (!title) return fail("Add a promotion title.");
  if (startsOn && endsOn && endsOn < startsOn) {
    return fail("The end date cannot be before the start date.");
  }

  try {
    const saved = await upsertPromotion(auth.service, {
      id,
      venue_id: auth.venueId,
      title: title.slice(0, 120),
      description: description ? description.slice(0, 400) : null,
      value_label: valueLabel ? valueLabel.slice(0, 80) : null,
      starts_on: startsOn,
      ends_on: endsOn,
      visible,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });

    if (imageBlob) {
      const imageUrl = await uploadPromotionImage(
        auth.service,
        auth.venueId,
        saved.id,
        imageBlob,
      );
      await upsertPromotion(auth.service, {
        id: saved.id,
        venue_id: auth.venueId,
        title: saved.title,
        description: saved.description,
        value_label: saved.value_label,
        image_url: imageUrl,
        starts_on: saved.starts_on,
        ends_on: saved.ends_on,
        visible: saved.visible,
        sort_order: saved.sort_order,
      });
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save the promotion.");
  }

  revalidateGuestFeedback();
  return { ok: true as const };
}

export async function removeGuestFeedbackPromotion(promotionId: string) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);
  if (!promotionId) return fail("Missing promotion.");

  try {
    const removed = await deletePromotion(auth.service, auth.venueId, promotionId);
    if (removed?.image_url) {
      const marker = "/storage/v1/object/public/guest-feedback/";
      const index = removed.image_url.indexOf(marker);
      if (index >= 0) {
        const path = decodeURIComponent(
          removed.image_url.slice(index + marker.length).split("?")[0] ?? "",
        );
        if (path) {
          await auth.service.storage.from(PROMO_BUCKET).remove([path]);
        }
      }
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not delete.");
  }
  revalidateGuestFeedback();
  return { ok: true as const };
}

export async function setGuestFeedbackPromotionVisible(
  promotionId: string,
  visible: boolean,
) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);
  if (!promotionId) return fail("Missing promotion.");

  try {
    await setPromotionVisible(auth.service, auth.venueId, promotionId, visible);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update.");
  }
  revalidateGuestFeedback();
  return { ok: true as const };
}

export async function reorderGuestFeedbackPromotions(orderedIds: string[]) {
  const auth = await requireEditor();
  if ("error" in auth) return fail(auth.error);
  const ids = orderedIds.filter((id) => id.length > 0);
  if (ids.length === 0) return fail("Nothing to reorder.");

  try {
    await reorderPromotions(auth.service, auth.venueId, ids);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not reorder.");
  }
  revalidateGuestFeedback();
  return { ok: true as const };
}

export async function saveGuestFeedbackSocials(formData: FormData) {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return fail(ctx.error);
  if (ctx.venue.is_global) {
    return fail("Open Guest Feedback from a venue, not Global.");
  }
  if (!canEditGuestFeedback(ctx.permissions, ctx.venue.id)) {
    return fail("You need Guest Feedback edit access.");
  }

  const service = createServiceClient();
  try {
    const current = await loadEmailChromeForVenue(service, ctx.venue);
    const socials = Object.fromEntries(
      EMAIL_CHROME_SOCIAL_LINK_KEYS.map((key) => [
        key,
        String(formData.get(emailChromeSocialFormName(key)) ?? ""),
      ]),
    );
    const next = resolveEmailChromeForVenue(
      mergeEmailChromeSettings({
        ...current,
        ...socials,
      }),
      ctx.venue,
    );

    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: ctx.venue.id,
        key: HR_SETTINGS_KEYS.emailChrome,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
    if (error) return fail(error.message);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save.");
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "guest_feedback.socials.save",
    module_key: SENTIMENT_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: HR_SETTINGS_KEYS.emailChrome,
    venue_id: ctx.venue.id,
  });
  revalidateGuestFeedback();
  revalidatePath("/hr/settings/emails/header-footer", "page");
  return { ok: true as const };
}
