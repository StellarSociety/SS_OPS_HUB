"use client";

import { useState, useTransition } from "react";
import { submitPublicGuestFeedback } from "@/lib/actions/guest-feedback-public";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input, inputVariants } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneWithCountryInput } from "@/components/hr/phone-with-country-input";
import { GuestFeedbackSocialLinks } from "@/components/sentiment/guest-feedback-social-links";
import type { GuestFeedbackSimPageId } from "@/components/sentiment/guest-feedback-path-panel";
import type {
  GuestFeedbackOutboundLink,
  GuestFeedbackPromotion,
  GuestFeedbackQuestion,
  GuestFeedbackSettings,
} from "@/lib/sentiment/guest-feedback/types";

export type GuestFeedbackPublicView = {
  code: string;
  venueName: string;
  venueAddress: string | null;
  venueLogoUrl: string | null;
  settings: GuestFeedbackSettings;
  questions: GuestFeedbackQuestion[];
  promotions: GuestFeedbackPromotion[];
  socials: GuestFeedbackOutboundLink[];
};

export function GuestFeedbackPublicPage({
  view,
  preview = false,
  previewScreen = "form",
  onPreviewNavigate,
}: {
  view: GuestFeedbackPublicView;
  preview?: boolean;
  previewScreen?: GuestFeedbackSimPageId;
  onPreviewNavigate?: (id: GuestFeedbackSimPageId) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState<string | null>(
    preview && previewScreen === "thank-you"
      ? view.settings.thank_you_message
      : null,
  );

  const enabledQuestions = view.questions.filter((question) => question.enabled);
  const showThankYou = preview
    ? previewScreen === "thank-you"
    : Boolean(thankYou);
  const showPromotions =
    !showThankYou &&
    view.promotions.length > 0 &&
    (!preview || previewScreen === "promotions");
  const showForm = !showThankYou && (preview ? previewScreen === "form" : true);
  const thankYouCopy = thankYou ?? view.settings.thank_you_message;

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 py-8">
      <VenueHeader view={view} />

      {showThankYou ? (
        <ThankYouCard message={thankYouCopy} socials={view.socials} />
      ) : null}

      {showPromotions ? <PromotionsSection view={view} /> : null}

      {preview && previewScreen === "promotions" ? (
        <Button
          type="button"
          className="w-full"
          onClick={() => onPreviewNavigate?.("form")}
        >
          Leave feedback
        </Button>
      ) : null}

      {showForm ? (
        <>
          <div className="space-y-0.5 text-center">
            <h1 className="font-serif text-[1.7rem] leading-tight text-[#3D421F]">
              {view.settings.form_title}
            </h1>
            {view.settings.form_intro ? (
              <p className="text-sm leading-snug text-black/55">
                {view.settings.form_intro}
              </p>
            ) : null}
          </div>
          <form
            className="space-y-4 rounded-2xl border border-black/8 bg-white/80 p-4 shadow-sm"
            noValidate={preview}
            onSubmit={(event) => {
              event.preventDefault();
              if (preview) {
                setThankYou(view.settings.thank_you_message);
                onPreviewNavigate?.("thank-you");
                return;
              }
              const formData = new FormData(event.currentTarget);
              setError(null);
              startTransition(async () => {
                const result = await submitPublicGuestFeedback(view.code, formData);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setThankYou(result.thankYou);
              });
            }}
          >
            {enabledQuestions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                disabled={pending}
                enforceRequired={!preview}
              />
            ))}
            {error ? <p className="text-sm text-[#b23b2e]">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send feedback"}
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}

function VenueHeader({ view }: { view: GuestFeedbackPublicView }) {
  if (!view.venueLogoUrl && !view.venueAddress) return null;
  return (
    <header className="text-center">
      {view.venueLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.venueLogoUrl}
          alt={view.venueName}
          className="mx-auto mb-3 h-12 w-auto"
        />
      ) : null}
      {view.venueAddress ? (
        <>
          <p className="text-[11px] font-medium leading-snug text-black/45">
            {view.venueAddress}
          </p>
          <div className="mx-auto mt-3 h-px w-full bg-black/10" />
        </>
      ) : null}
    </header>
  );
}

function ThankYouCard({
  message,
  socials,
}: {
  message: string;
  socials: GuestFeedbackOutboundLink[];
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-0.5 text-center">
        <h1 className="font-serif text-[1.7rem] leading-tight text-[#3D421F]">
          Thank you
        </h1>
        <p className="text-sm leading-snug text-black/55">{message}</p>
      </div>
      {socials.length > 0 ? (
        <div className="rounded-2xl border border-black/8 bg-white/80 px-5 py-6 text-center shadow-sm">
          <GuestFeedbackSocialLinks links={socials} />
        </div>
      ) : null}
    </div>
  );
}

function PromotionsSection({ view }: { view: GuestFeedbackPublicView }) {
  return (
    <section className="space-y-2.5">
      <div className="space-y-0.5 text-center">
        <h2 className="font-serif text-[1.7rem] leading-tight text-[#3D421F]">
          {view.settings.promotions_heading}
        </h2>
        <p className="text-sm leading-snug text-black/55">
          Ongoing Events & Promotions
        </p>
      </div>
      <ul className="space-y-2.5">
        {view.promotions.map((promo) => (
          <li
            key={promo.id}
            className="overflow-hidden rounded-2xl border border-black/8 bg-white/80 shadow-sm"
          >
            {promo.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={promo.image_url}
                alt=""
                className="h-36 w-full object-cover"
              />
            ) : null}
            <div className="space-y-1 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-serif text-lg text-[#3D421F]">
                  {promo.title}
                </p>
                {promo.value_label ? (
                  <span className="shrink-0 rounded-full bg-[var(--venue-primary,#818a40)]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#3D421F]">
                    {promo.value_label}
                  </span>
                ) : null}
              </div>
              {promo.description ? (
                <p className="text-sm text-black/55">{promo.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuestionField({
  question,
  disabled,
  enforceRequired,
}: {
  question: GuestFeedbackQuestion;
  disabled: boolean;
  enforceRequired: boolean;
}) {
  const id = `gf-${question.question_key}`;
  const required = enforceRequired && question.required;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {question.label}
        {question.required ? (
          <span className="ml-1 text-[#b23b2e]">*</span>
        ) : null}
      </Label>
      {question.helper_text ? (
        <p className="text-xs text-black/45">{question.helper_text}</p>
      ) : null}
      {question.question_type === "rating" ? (
        <StarRatingInput
          name={question.question_key}
          required={required}
          disabled={disabled}
        />
      ) : question.question_type === "long_text" ? (
        <Textarea
          id={id}
          name={question.question_key}
          required={required}
          disabled={disabled}
          rows={4}
        />
      ) : question.question_type === "yes_no" ? (
        <div className="grid grid-cols-2 gap-2">
          {(["yes", "no"] as const).map((value) => (
            <label
              key={value}
              className="flex h-10 items-center justify-center rounded-md border border-black/10 bg-white text-sm font-medium text-[#3D421F] has-[:checked]:border-[var(--venue-primary)]/50 has-[:checked]:bg-[var(--venue-primary)]/12"
            >
              <input
                type="radio"
                name={question.question_key}
                value={value}
                required={required}
                disabled={disabled}
                className="sr-only"
              />
              {value === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      ) : question.question_type === "choice" ? (
        <div className="space-y-2">
          {question.choices.map((choice) => (
            <label
              key={choice}
              className="flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] has-[:checked]:border-[var(--venue-primary)]/50 has-[:checked]:bg-[var(--venue-primary)]/12"
            >
              <input
                type="radio"
                name={question.question_key}
                value={choice}
                required={required}
                disabled={disabled}
              />
              {choice}
            </label>
          ))}
        </div>
      ) : question.question_type === "date" ? (
        <DateField
          id={id}
          name={question.question_key}
          required={required}
          disabled={disabled}
        />
      ) : question.question_type === "phone" ? (
        <PhoneField
          id={id}
          name={question.question_key}
          required={required}
          disabled={disabled}
        />
      ) : (
        <Input
          id={id}
          name={question.question_key}
          type={question.question_type === "email" ? "email" : "text"}
          autoComplete={
            question.question_type === "email"
              ? "email"
              : question.question_type === "name"
                ? "name"
                : undefined
          }
          required={required}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function DateField({
  id,
  name,
  required,
  disabled,
}: {
  id: string;
  name: string;
  required: boolean;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <>
      <DateInput
        id={id}
        value={value}
        onChange={setValue}
        disabled={disabled}
        className="w-full"
        inputClassName="h-10"
      />
      <input type="hidden" name={name} value={value} required={required} />
    </>
  );
}

function PhoneField({
  id,
  name,
  required,
  disabled,
}: {
  id: string;
  name: string;
  required: boolean;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <PhoneWithCountryInput
      id={id}
      name={name}
      value={value}
      onChange={setValue}
      disabled={disabled}
      required={required}
      autoDetectCountry
      placeholder="50 123 4567"
      inputClassName={inputVariants()}
    />
  );
}

function StarRatingInput({
  name,
  required,
  disabled,
}: {
  name: string;
  required: boolean;
  disabled: boolean;
}) {
  const [value, setValue] = useState(0);
  const STAR_PATH =
    "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

  return (
    <div>
      <input
        type="hidden"
        name={name}
        value={value || ""}
        required={required}
      />
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => setValue(star)}
            className="rounded-md p-0.5 transition hover:scale-105 disabled:opacity-50"
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            aria-pressed={value === star}
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden>
              <path
                d={STAR_PATH}
                fill={value >= star ? "#FABB05" : "#E0E0E0"}
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
