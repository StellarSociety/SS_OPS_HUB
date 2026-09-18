"use client";

import { useState, useTransition, type ReactNode } from "react";
import { HiringCopyHtml } from "@/components/hr/hiring-copy-editor";
import { GuestFeedbackSocialLinks } from "@/components/sentiment/guest-feedback-social-links";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitHiringApplication } from "@/lib/actions/hiring-public";
import type { GuestFeedbackOutboundLink } from "@/lib/sentiment/guest-feedback/types";
import {
  DEFAULT_HIRING_INTRO_BACKGROUND,
  DEFAULT_HIRING_INTRO2_BACKGROUND,
  fillHiringCopyTokens,
  formatHiringPositionNames,
  hasSecondHiringIntro,
  hiringHexIsDark,
  isHiringFormAccepting,
  type HiringForm,
  type HiringFormBlock,
} from "@/lib/hr/hiring/types";
import { cn } from "@/lib/utils";

const pagePad =
  "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8";

function PublicPage({
  children,
  className,
  centered = false,
  backgroundColor,
}: {
  children: ReactNode;
  className?: string;
  centered?: boolean;
  backgroundColor?: string;
}) {
  return (
    <div
      className={cn("min-h-dvh w-full", backgroundColor && "transition-colors")}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <div
        className={cn(
          "mx-auto flex w-full min-h-dvh max-w-3xl flex-col",
          pagePad,
          centered && "items-center justify-center text-center",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function HiringPublicForm({
  form,
  blocks,
  venueName,
  socials,
  closedReason,
}: {
  form: HiringForm;
  blocks: HiringFormBlock[];
  venueName: string;
  socials: GuestFeedbackOutboundLink[];
  closedReason?: string;
}) {
  const showIntro2 = hasSecondHiringIntro(form);
  const [step, setStep] = useState<"intro" | "intro2" | "form" | "done">(
    "intro",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const accepting = isHiringFormAccepting(form, {
    applicationCount: form.application_count ?? 0,
  });
  const closed = closedReason || (!accepting.ok ? accepting.reason : null);
  const publicTitle = form.intro2_title.trim();
  const introBackground =
    form.intro_background_color || DEFAULT_HIRING_INTRO_BACKGROUND;
  const introDark = hiringHexIsDark(introBackground);
  const intro2Background =
    form.intro2_background_color || DEFAULT_HIRING_INTRO2_BACKGROUND;
  const intro2Dark = hiringHexIsDark(intro2Background);
  const intro2PositionsText = formatHiringPositionNames(
    form.intro2_position_labels ?? [],
  );
  const intro2Copy = fillHiringCopyTokens(form.intro2_description, {
    positions: intro2PositionsText,
  });

  if (closed && step !== "done") {
    return (
      <PublicPage centered className="max-w-xl">
        <h1 className="font-serif text-2xl text-[#3D421F] sm:text-3xl">
          {venueName}
        </h1>
        <p className="mt-3 w-full text-sm text-black/60 sm:text-base">{closed}</p>
      </PublicPage>
    );
  }

  if (step === "done") {
    return (
      <PublicPage centered className="max-w-xl">
        <h1 className="font-serif text-2xl text-[#3D421F] sm:text-3xl">
          Thank you
        </h1>
        <HiringCopyHtml
          html={form.end_message}
          className="mt-4 w-full text-sm sm:text-base"
        />
        {form.show_socials ? (
          <div className="mt-8 w-full">
            <GuestFeedbackSocialLinks links={socials} />
          </div>
        ) : null}
      </PublicPage>
    );
  }

  if (step === "intro") {
    return (
      <PublicPage centered backgroundColor={introBackground}>
        {form.intro_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.intro_image_url}
            alt=""
            className="mb-6 h-auto w-full max-h-44 max-w-full object-contain sm:max-h-56 md:max-h-72"
          />
        ) : null}
        <HiringCopyHtml
          html={form.intro_description}
          className={cn(
            "w-full text-sm sm:text-base",
            introDark
              ? "text-white/85 [&_blockquote]:border-white/25 [&_h3]:text-white [&_hr]:border-white/20"
              : undefined,
          )}
        />
        <Button
          className="mt-8 h-11 w-full max-w-sm bg-black text-white hover:bg-black/80 hover:opacity-100 sm:w-auto sm:min-w-[12rem]"
          type="button"
          onClick={() => setStep(showIntro2 ? "intro2" : "form")}
        >
          {form.intro_button_label || "Apply here"}
        </Button>
      </PublicPage>
    );
  }

  if (step === "intro2") {
    return (
      <div
        className="min-h-dvh w-full transition-colors"
        style={{ backgroundColor: intro2Background }}
      >
        <div className="flex min-h-dvh w-full flex-col items-center justify-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
          {form.intro2_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.intro2_image_url}
              alt=""
              className="mb-6 h-auto w-full object-contain md:w-2/3"
            />
          ) : null}
          <div
            className={cn(
              "w-full max-w-3xl text-center",
              "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-8",
            )}
          >
            {publicTitle ? (
              <h1
                className={cn(
                  "w-full font-serif text-2xl leading-tight sm:text-3xl md:text-4xl",
                  intro2Dark ? "text-white" : "text-[#3D421F]",
                )}
              >
                {publicTitle}
              </h1>
            ) : null}
            <HiringCopyHtml
              html={intro2Copy}
              className={cn(
                "mt-4 w-full text-sm sm:text-base",
                intro2Dark
                  ? "text-white/85 [&_blockquote]:border-white/25 [&_h3]:text-white [&_hr]:border-white/20"
                  : undefined,
              )}
            />
            <Button
              className="mt-8 h-11 w-full max-w-sm sm:w-auto sm:min-w-[12rem]"
              type="button"
              onClick={() => setStep("form")}
            >
              {form.intro2_button_label || "Continue"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      className={cn(
        "mx-auto flex w-full min-h-dvh max-w-2xl flex-col space-y-5",
        pagePad,
        "py-8 md:py-12",
      )}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await submitHiringApplication(form.public_code, data);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setStep("done");
        });
      }}
    >
      {publicTitle ? (
        <h1 className="font-serif text-2xl text-[#3D421F] sm:text-3xl">
          {publicTitle}
        </h1>
      ) : null}
      {blocks.map((block) => {
        if (block.kind === "title") {
          return (
            <h2 key={block.id} className="pt-2 font-serif text-xl text-[#3D421F]">
              {block.title}
            </h2>
          );
        }
        if (block.kind === "description") {
          return (
            <HiringCopyHtml
              key={block.id}
              html={block.description ?? ""}
              className="text-black/60"
            />
          );
        }
        const name = `field_${block.id}`;
        const label = block.field_label || "Field";
        return (
          <div key={block.id} className="space-y-1.5">
            <Label htmlFor={name}>
              {label}
              {block.required ? " *" : ""}
            </Label>
            {block.field_type === "long_text" ? (
              <Textarea
                id={name}
                name={name}
                required={block.required}
                disabled={pending}
                rows={4}
              />
            ) : block.field_type === "date" ? (
              <DateInput
                id={name}
                name={name}
                value={values[block.id] ?? ""}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [block.id]: value }))
                }
                disabled={pending}
                className="w-full"
              />
            ) : block.field_type === "picture" ? (
              <Input
                id={name}
                name={name}
                type="file"
                accept="image/*"
                required={block.required}
                disabled={pending}
              />
            ) : block.field_type === "file" ? (
              <Input
                id={name}
                name={name}
                type="file"
                multiple={block.config.maxFiles > 1}
                required={block.required}
                disabled={pending}
              />
            ) : (
              <Input
                id={name}
                name={name}
                type={
                  block.field_type === "email"
                    ? "email"
                    : block.field_type === "number"
                      ? "number"
                      : "text"
                }
                required={block.required}
                disabled={pending}
              />
            )}
          </div>
        );
      })}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full sm:w-auto"
          disabled={pending}
          onClick={() => setStep(showIntro2 ? "intro2" : "intro")}
        >
          Back
        </Button>
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>
          {pending ? "Sending…" : "Submit application"}
        </Button>
      </div>
    </form>
  );
}
