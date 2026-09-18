"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { HiringCopyHtml } from "@/components/hr/hiring-copy-editor";
import { NationalitySelect } from "@/components/hr/nationality-select";
import { PhoneWithCountryInput } from "@/components/hr/phone-with-country-input";
import { GuestFeedbackSocialLinks } from "@/components/sentiment/guest-feedback-social-links";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input, inputVariants } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDisplayDate } from "@/lib/dates/display";
import { submitHiringApplication } from "@/lib/actions/hiring-public";
import {
  clearHiringFormDraft,
  loadHiringFormDraft,
  saveHiringFormDraft,
} from "@/lib/hr/hiring/draft";
import type { GuestFeedbackOutboundLink } from "@/lib/sentiment/guest-feedback/types";
import {
  clusterHiringRadioFields,
  hiringMatrixCopy,
} from "@/lib/hr/hiring/matrix";
import {
  DEFAULT_HIRING_BODY_BACKGROUND,
  DEFAULT_HIRING_INTRO_BACKGROUND,
  DEFAULT_HIRING_INTRO2_BACKGROUND,
  fillHiringCopyTokens,
  formatHiringPositionNames,
  hiringApplicantNameFromFieldValues,
  hasSecondHiringIntro,
  hiringFieldChoiceOptions,
  hiringFieldPlaceholder,
  hiringHexIsDark,
  isHiringFormAccepting,
  splitHiringBodyPages,
  type HiringForm,
  type HiringFormBlock,
} from "@/lib/hr/hiring/types";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const pagePad =
  "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8";

const publicBtn =
  "hiring-public-btn bg-black text-white hover:bg-neutral-900 hover:opacity-100 focus-visible:ring-black";
const publicBtnNav = `${publicBtn} h-11 w-full max-w-sm sm:w-auto sm:min-w-[10.5rem]`;

const MULTI_SEP = "\n";

type PageCluster =
  | { type: "block"; block: HiringFormBlock }
  | { type: "matrix"; blocks: HiringFormBlock[]; options: string[] };

function clusterPageBlocks(blocks: HiringFormBlock[]): PageCluster[] {
  return clusterHiringRadioFields(blocks).map((cluster) =>
    cluster.type === "matrix"
      ? {
          type: "matrix" as const,
          blocks: cluster.items,
          options: hiringFieldChoiceOptions(
            "radio",
            cluster.items[0]?.config.options,
          ),
        }
      : { type: "block" as const, block: cluster.item },
  );
}

function dubaiTodayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
  }).format(new Date());
}

function requiredFieldMissing(
  block: HiringFormBlock,
  values: Record<string, string>,
  formEl: HTMLFormElement,
): boolean {
  if (block.kind !== "field" || !block.required || !block.field_type) {
    return false;
  }
  if (block.field_type === "picture" || block.field_type === "file") {
    const input = formEl.querySelector<HTMLInputElement>(
      `input[name="field_${block.id}"]`,
    );
    return !input?.files?.length;
  }
  const raw = (values[block.id] ?? "").trim();
  if (block.field_type === "checkbox") return raw !== "Yes";
  return raw.length === 0;
}

function firstIncompletePage(
  pages: HiringFormBlock[][],
  values: Record<string, string>,
  formEl: HTMLFormElement,
): number | null {
  for (let index = 0; index < pages.length; index += 1) {
    for (const block of pages[index] ?? []) {
      if (requiredFieldMissing(block, values, formEl)) return index;
    }
  }
  return null;
}

function hiringPageIsValid(pageEl: HTMLElement | null): boolean {
  if (!pageEl) return true;
  for (const group of pageEl.querySelectorAll<HTMLElement>(
    "[data-hiring-multi]",
  )) {
    if (group.dataset.required !== "true") continue;
    const first = group.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    );
    const checked = group.querySelectorAll("input[type=checkbox]:checked");
    if (checked.length === 0) {
      first?.setCustomValidity("Please select at least one choice.");
      first?.reportValidity();
      first?.setCustomValidity("");
      return false;
    }
  }
  const fields = pageEl.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");
  for (const field of fields) {
    if (
      field instanceof HTMLInputElement &&
      field.type === "checkbox" &&
      field.closest("[data-hiring-multi]")
    ) {
      continue;
    }
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}

function PublicNav({
  onBack,
  backDisabled,
  className,
  children,
}: {
  onBack?: () => void;
  backDisabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-8 flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap",
        className,
      )}
    >
      {onBack ? (
        <Button
          type="button"
          className={publicBtnNav}
          disabled={backDisabled}
          onClick={onBack}
        >
          Back
        </Button>
      ) : null}
      {children}
    </div>
  );
}

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
          "mx-auto flex w-full min-h-dvh max-w-5xl flex-col",
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

function PublicPageStepper({
  stepCount,
  activeIndex,
  caption,
  reviewIndex,
  dark,
  disabled,
  ariaLabels,
  onJump,
}: {
  stepCount: number;
  activeIndex: number;
  caption: string;
  reviewIndex: number;
  dark: boolean;
  disabled?: boolean;
  ariaLabels: string[];
  onJump: (index: number) => void;
}) {
  if (stepCount <= 1) return null;
  return (
    <nav aria-label="Application pages" className="mb-5 space-y-2 pb-1 sm:mb-7">
      <ol className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
        {Array.from({ length: stepCount }, (_, index) => {
          const active = index === activeIndex;
          const reached = index < activeIndex;
          const isReview = index === reviewIndex;
          return (
            <li key={index} className="flex items-center gap-1 sm:gap-1.5">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-3 sm:w-5",
                    reached || active
                      ? dark
                        ? "bg-white/55"
                        : "bg-black/40"
                      : dark
                        ? "bg-white/20"
                        : "bg-black/15",
                  )}
                />
              ) : null}
              <button
                type="button"
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                aria-label={ariaLabels[index] ?? `Go to step ${index + 1}`}
                onClick={() => onJump(index)}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-sm font-semibold transition-colors sm:h-9 sm:min-w-9",
                  active
                    ? "border-black bg-black text-white shadow-[0_8px_18px_-10px_rgba(0,0,0,0.65)]"
                    : dark
                      ? "border-white/25 bg-white/10 text-white hover:border-white/50"
                      : "border-black/15 bg-white text-[#3D421F] hover:border-black/35",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {isReview ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  index + 1
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p
        className={cn(
          "text-center text-xs font-semibold uppercase tracking-[0.18em]",
          dark ? "text-white/50" : "text-black/40",
        )}
      >
        {caption}
      </p>
    </nav>
  );
}

function SectionTitle({
  children,
  bodyDark,
}: {
  children: ReactNode;
  bodyDark: boolean;
}) {
  return (
    <h2
      className={cn(
        "rounded-xl px-4 py-3 font-serif text-xl tracking-tight",
        bodyDark
          ? "bg-white/12 text-white ring-1 ring-white/15"
          : "bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F] shadow-[inset_0_0_0_1px_rgba(61,66,31,0.1)]",
      )}
    >
      {children}
    </h2>
  );
}

function uploadedFileLabel(
  formEl: HTMLFormElement | null,
  blockId: string,
): string {
  if (!formEl) return "";
  const input = formEl.querySelector<HTMLInputElement>(
    `input[name="field_${blockId}"]`,
  );
  if (!input?.files?.length) return "";
  return Array.from(input.files)
    .map((file) => file.name)
    .join(", ");
}

function formatReviewValue(
  block: HiringFormBlock,
  value: string,
  fileLabel: string,
): string {
  if (block.field_type === "picture" || block.field_type === "file") {
    return fileLabel || "No file chosen";
  }
  const raw = value.trim();
  if (!raw) return "Not answered";
  if (block.field_type === "multiple_choice") {
    return raw
      .split(MULTI_SEP)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(", ");
  }
  if (block.field_type === "date") return formatDisplayDate(raw);
  if (block.field_type === "checkbox") return raw === "Yes" ? "Yes" : "No";
  return raw;
}

function ChoiceCards({
  name,
  options,
  required,
  disabled,
  value,
  bodyDark,
  onChange,
}: {
  name: string;
  options: string[];
  required: boolean;
  disabled: boolean;
  value: string;
  bodyDark: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        options.length <= 3 ? "sm:grid-cols-2" : "grid-cols-1",
      )}
      role="radiogroup"
    >
      {options.map((option) => {
        const selected = value === option;
        return (
          <label
            key={option}
            className={cn(
              "relative flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium transition-colors",
              selected
                ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F] shadow-sm"
                : bodyDark
                  ? "border-white/20 bg-white/5 text-white hover:border-white/40"
                  : "border-black/12 bg-white text-[#3D421F] hover:border-black/25",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              required={required}
              disabled={disabled}
              checked={selected}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                selected
                  ? "border-[var(--venue-primary,#818a40)]"
                  : bodyDark
                    ? "border-white/35"
                    : "border-black/25",
              )}
            >
              {selected ? (
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--venue-primary,#818a40)]" />
              ) : null}
            </span>
            <span>{option}</span>
          </label>
        );
      })}
    </div>
  );
}

function HiringRadioMatrix({
  blocks,
  options,
  values,
  pending,
  bodyDark,
  onValueChange,
}: {
  blocks: HiringFormBlock[];
  options: string[];
  values: Record<string, string>;
  pending: boolean;
  bodyDark: boolean;
  onValueChange: (blockId: string, value: string) => void;
}) {
  const { title, rows, instructions } = hiringMatrixCopy(blocks);
  const anyRequired = blocks.some((block) => block.required);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border p-4 sm:p-5",
        bodyDark
          ? "border-white/15 bg-white/5"
          : "border-black/10 bg-white shadow-[0_10px_32px_-18px_rgba(61,66,31,0.4)]",
      )}
    >
      {title ? (
        <p
          className={cn(
            "text-base font-semibold",
            bodyDark ? "text-white" : "text-[#3D421F]",
          )}
        >
          {title}
          {anyRequired ? <span className="text-red-600"> *</span> : null}
        </p>
      ) : null}
      {instructions ? (
        <p
          className={cn(
            "mt-1 text-sm italic leading-relaxed",
            bodyDark ? "text-white/70" : "text-black/55",
          )}
        >
          {instructions}
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-[8.5rem] min-w-[7.5rem] pb-2 pr-3" />
              {options.map((option) => (
                <th
                  key={option}
                  className={cn(
                    "min-w-[4.75rem] px-1 pb-2 text-center text-[11px] font-semibold leading-snug sm:text-xs",
                    bodyDark ? "text-white/80" : "text-[#3D421F]",
                  )}
                >
                  <span className="mx-auto block max-w-[5.5rem]">{option}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, rowIndex) => (
              <tr key={block.id}>
                <th
                  scope="row"
                  className={cn(
                    "border-t py-1 pr-3 text-left text-sm font-medium",
                    bodyDark
                      ? "border-white/10 text-white"
                      : "border-black/10 text-[#3D421F]",
                  )}
                >
                  {rows[rowIndex]}
                  {block.required ? (
                    <span className="text-red-600"> *</span>
                  ) : null}
                </th>
                {options.map((option) => {
                  const selected = (values[block.id] ?? "") === option;
                  return (
                    <td
                      key={option}
                      className={cn(
                        "border-t p-0.5",
                        bodyDark ? "border-white/10" : "border-black/10",
                      )}
                    >
                      <label
                        className={cn(
                          "relative flex h-11 cursor-pointer items-center justify-center rounded-xl transition-colors",
                          pending && "pointer-events-none opacity-50",
                          selected
                            ? bodyDark
                              ? "bg-[var(--venue-primary,#818a40)]/25"
                              : "bg-[var(--venue-secondary,#F0F3DD)]"
                            : bodyDark
                              ? "hover:bg-white/10"
                              : "hover:bg-black/[0.04]",
                        )}
                      >
                        <span className="sr-only">
                          {rows[rowIndex]}: {option}
                        </span>
                        <input
                          type="radio"
                          name={`field_${block.id}`}
                          value={option}
                          required={block.required}
                          disabled={pending}
                          checked={selected}
                          onChange={() => onValueChange(block.id, option)}
                          className="absolute inset-0 z-10 cursor-pointer opacity-0"
                        />
                        <span
                          className={cn(
                            "pointer-events-none flex h-6 w-6 items-center justify-center rounded-full border-2",
                            selected
                              ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)]"
                              : bodyDark
                                ? "border-white/35 bg-transparent"
                                : "border-black/25 bg-white",
                          )}
                          aria-hidden
                        >
                          {selected ? (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          ) : null}
                        </span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewAnswers({
  pages,
  values,
  formEl,
  bodyDark,
  onEditPage,
}: {
  pages: HiringFormBlock[][];
  values: Record<string, string>;
  formEl: HTMLFormElement | null;
  bodyDark: boolean;
  onEditPage: (index: number) => void;
}) {
  const muted = bodyDark ? "text-white/50" : "text-black/45";
  const labelClass = bodyDark ? "text-white/70" : "text-black/55";
  const valueClass = bodyDark ? "text-white" : "text-[#3D421F]";
  const cardClass = bodyDark
    ? "border-white/15 bg-white/5"
    : "border-black/10 bg-white";

  return (
    <div className="space-y-5">
      <SectionTitle bodyDark={bodyDark}>Review your answers</SectionTitle>
      <p className={cn("text-sm leading-relaxed", labelClass)}>
        Check everything looks right. You can edit a section, then come back
        here to submit.
      </p>
      {pages.map((pageBlocks, pageIndex) => {
        const clusters = clusterPageBlocks(pageBlocks);
        const hasContent = clusters.some(
          (cluster) =>
            cluster.type === "matrix" ||
            cluster.block.kind === "field" ||
            cluster.block.kind === "title",
        );
        if (!hasContent) return null;
        return (
          <section
            key={`review-page-${pageIndex}`}
            className={cn("overflow-hidden rounded-2xl border", cardClass)}
          >
            <div
              className={cn(
                "flex items-center justify-between gap-3 border-b px-4 py-3",
                bodyDark ? "border-white/10" : "border-black/10",
              )}
            >
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.16em]",
                  muted,
                )}
              >
                Page {pageIndex + 1}
              </p>
              <button
                type="button"
                onClick={() => onEditPage(pageIndex)}
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.14em] underline-offset-4 hover:underline",
                  bodyDark ? "text-white" : "text-[#3D421F]",
                )}
              >
                Edit
              </button>
            </div>
            <dl
              className={cn(
                "divide-y",
                bodyDark ? "divide-white/10" : "divide-black/10",
              )}
            >
              {clusters.map((cluster) => {
                if (cluster.type === "matrix") {
                  const { title, rows } = hiringMatrixCopy(cluster.blocks);
                  return (
                    <div key={cluster.blocks[0]!.id} className="space-y-2 px-4 py-3">
                      <dt className={cn("text-sm font-medium", labelClass)}>
                        {title || "Answers"}
                      </dt>
                      {cluster.blocks.map((block, rowIndex) => {
                        const answer = formatReviewValue(
                          block,
                          values[block.id] ?? "",
                          "",
                        );
                        const empty = answer === "Not answered";
                        return (
                          <div
                            key={block.id}
                            className="flex items-start justify-between gap-4"
                          >
                            <dt className={cn("text-sm", labelClass)}>
                              {rows[rowIndex]}
                            </dt>
                            <dd
                              className={cn(
                                "text-right text-sm font-medium whitespace-pre-wrap",
                                empty ? muted : valueClass,
                              )}
                            >
                              {answer}
                            </dd>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                const block = cluster.block;
                if (block.kind === "title") {
                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "px-4 py-2.5 text-sm font-semibold",
                        valueClass,
                      )}
                    >
                      {block.title}
                    </div>
                  );
                }
                if (block.kind !== "field") return null;
                const answer = formatReviewValue(
                  block,
                  values[block.id] ?? "",
                  uploadedFileLabel(formEl, block.id),
                );
                const empty =
                  answer === "Not answered" || answer === "No file chosen";
                return (
                  <div
                    key={block.id}
                    className="flex items-start justify-between gap-4 px-4 py-3"
                  >
                    <dt className={cn("text-sm", labelClass)}>
                      {block.field_label || "Field"}
                    </dt>
                    <dd
                      className={cn(
                        "max-w-[60%] text-right text-sm font-medium whitespace-pre-wrap",
                        empty ? muted : valueClass,
                      )}
                    >
                      {answer}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

export function HiringPublicForm({
  form,
  blocks,
  venue,
  venueName,
  socials,
  closedReason,
}: {
  form: HiringForm;
  blocks: HiringFormBlock[];
  venue?: Venue | null;
  venueName: string;
  socials: GuestFeedbackOutboundLink[];
  closedReason?: string;
}) {
  const showIntro2 = hasSecondHiringIntro(form);
  const [step, setStep] = useState<"intro" | "intro2" | "form" | "done">(
    "intro",
  );
  const [bodyPage, setBodyPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [reportPage, setReportPage] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const restoredRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const accepting = isHiringFormAccepting(form, {
    applicationCount: form.application_count ?? 0,
  });
  const closed = closedReason || (!accepting.ok ? accepting.reason : null);
  const publicTitle = form.intro2_title.trim();
  const barTitle = publicTitle || form.name.trim();
  const introBackground =
    form.intro_background_color || DEFAULT_HIRING_INTRO_BACKGROUND;
  const introDark = hiringHexIsDark(introBackground);
  const intro2Background =
    form.intro2_background_color || DEFAULT_HIRING_INTRO2_BACKGROUND;
  const intro2Dark = hiringHexIsDark(intro2Background);
  const intro2PositionsText = formatHiringPositionNames(
    form.intro2_position_labels ?? [],
  );
  const applicantName = hiringApplicantNameFromFieldValues(blocks, values);
  const intro2Copy = fillHiringCopyTokens(form.intro2_description, {
    positions: intro2PositionsText,
    name: applicantName,
  });
  const bodyBackground =
    form.body_background_color || DEFAULT_HIRING_BODY_BACKGROUND;
  const bodyDark = hiringHexIsDark(bodyBackground);
  const bodyPages = useMemo(() => splitHiringBodyPages(blocks), [blocks]);
  const bodyPageCount = bodyPages.length;
  const currentBodyPage = Math.min(bodyPage, Math.max(0, bodyPageCount - 1));
  const isLastBodyPage = currentBodyPage >= bodyPageCount - 1;
  const todayIso = useMemo(() => dubaiTodayIso(), []);
  const flowSteps = useMemo(() => {
    const items: Array<{
      kind: "intro" | "intro2" | "body" | "review";
      page?: number;
      ariaLabel: string;
      caption: string;
    }> = [
      { kind: "intro", ariaLabel: "Introduction", caption: "Introduction" },
    ];
    if (showIntro2) {
      items.push({
        kind: "intro2",
        ariaLabel: "Department introduction",
        caption: "Department",
      });
    }
    for (let page = 0; page < bodyPageCount; page += 1) {
      items.push({
        kind: "body",
        page,
        ariaLabel: `Application page ${page + 1}`,
        caption: `Page ${page + 1} of ${bodyPageCount}`,
      });
    }
    items.push({
      kind: "review",
      ariaLabel: "Review answers",
      caption: "Review answers",
    });
    return items;
  }, [bodyPageCount, showIntro2]);
  const introOffset = 1 + (showIntro2 ? 1 : 0);
  const activeFlowIndex =
    step === "intro"
      ? 0
      : step === "intro2"
        ? showIntro2
          ? 1
          : 0
        : reviewing
          ? introOffset + bodyPageCount
          : introOffset + currentBodyPage;
  const stepperDark =
    step === "intro" ? introDark : step === "intro2" ? intro2Dark : bodyDark;

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const draft = loadHiringFormDraft(form.public_code);
    if (!draft) return;
    setValues(draft.values);
    setBodyPage(
      Math.min(draft.bodyPage, Math.max(0, bodyPageCount - 1)),
    );
    setSavedNote("Restored your saved answers on this device.");
  }, [bodyPageCount, form.public_code]);

  useEffect(() => {
    if (reportPage === null) return;
    if (reportPage !== currentBodyPage) return;
    const pageEl = document.getElementById(`hiring-body-page-${reportPage}`);
    hiringPageIsValid(pageEl);
    setReportPage(null);
  }, [currentBodyPage, reportPage]);

  function persistDraft(
    nextValues = values,
    nextPage = currentBodyPage,
  ) {
    try {
      saveHiringFormDraft(form.public_code, {
        values: nextValues,
        bodyPage: nextPage,
      });
    } catch {
      setSavedNote("Could not save on this device.");
    }
  }

  function goToPage(index: number) {
    setStep("form");
    if (index >= bodyPageCount) {
      enterReview();
      return;
    }
    const next = Math.min(Math.max(0, index), Math.max(0, bodyPageCount - 1));
    persistDraft(values, next);
    setError(null);
    setReviewing(false);
    setBodyPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function enterReview() {
    setStep("form");
    const formEl = formRef.current;
    if (!formEl) return;
    const invalidPage = firstIncompletePage(bodyPages, values, formEl);
    if (invalidPage !== null) {
      setReviewing(false);
      setError("Please complete all required fields before reviewing.");
      if (invalidPage !== currentBodyPage || reviewing) {
        setBodyPage(invalidPage);
        setReportPage(invalidPage);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        hiringPageIsValid(
          document.getElementById(`hiring-body-page-${invalidPage}`),
        );
      }
      return;
    }
    persistDraft(values, currentBodyPage);
    setError(null);
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setFieldValue(blockId: string, value: string) {
    setValues((current) => ({ ...current, [blockId]: value }));
  }

  function jumpToFlowIndex(index: number) {
    const target = flowSteps[index];
    if (!target) return;
    if (target.kind === "intro") {
      persistDraft(values, currentBodyPage);
      setReviewing(false);
      setError(null);
      setStep("intro");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (target.kind === "intro2") {
      persistDraft(values, currentBodyPage);
      setReviewing(false);
      setError(null);
      setStep("intro2");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (target.kind === "review") {
      enterReview();
      return;
    }
    goToPage(target.page ?? 0);
  }

  function renderFlowStepper() {
    return (
      <PublicPageStepper
        stepCount={flowSteps.length}
        activeIndex={activeFlowIndex}
        caption={flowSteps[activeFlowIndex]?.caption ?? ""}
        reviewIndex={flowSteps.length - 1}
        dark={stepperDark}
        disabled={pending}
        ariaLabels={flowSteps.map((item) => item.ariaLabel)}
        onJump={jumpToFlowIndex}
      />
    );
  }

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
          html={fillHiringCopyTokens(form.end_message, { name: applicantName })}
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

  return (
    <>
      {step === "intro" ? (
        <div
          className="min-h-dvh w-full transition-colors"
          style={{ backgroundColor: introBackground }}
        >
          <div
            className={cn(
              "mx-auto w-full max-w-2xl",
              "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-8",
              "pt-[max(1.25rem,env(safe-area-inset-top))]",
            )}
          >
            {renderFlowStepper()}
          </div>
          <div
            className={cn(
              "mx-auto flex w-full max-w-5xl flex-col items-center justify-center text-center",
              pagePad,
              "min-h-[calc(100dvh-7rem)]",
            )}
          >
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
            <PublicNav>
              <Button
                className={publicBtnNav}
                type="button"
                onClick={() => {
                  setBodyPage(0);
                  setStep(showIntro2 ? "intro2" : "form");
                }}
              >
                {form.intro_button_label || "Apply here"}
              </Button>
            </PublicNav>
          </div>
        </div>
      ) : null}
      {step === "intro2" ? (
        <div
          className="min-h-dvh w-full transition-colors"
          style={{ backgroundColor: intro2Background }}
        >
          <div
            className={cn(
              "mx-auto w-full max-w-2xl",
              "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-8",
              "pt-[max(1.25rem,env(safe-area-inset-top))]",
            )}
          >
            {renderFlowStepper()}
          </div>
          <div className="flex w-full flex-col items-center justify-center pb-[max(2rem,env(safe-area-inset-bottom))]">
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
                "w-full max-w-5xl text-center",
                "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-10 lg:px-12",
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
              <PublicNav onBack={() => setStep("intro")}>
                <Button
                  className={publicBtnNav}
                  type="button"
                  onClick={() => {
                    setBodyPage(0);
                    setStep("form");
                  }}
                >
                  {form.intro2_button_label || "Continue"}
                </Button>
              </PublicNav>
            </div>
          </div>
        </div>
      ) : null}
      <div
        hidden={step !== "form"}
        className="min-h-dvh w-full transition-colors"
        style={{ backgroundColor: bodyBackground }}
      >
      {barTitle ? (
        <header
          className={cn(
            "sticky top-0 z-30 w-full border-b",
            bodyDark
              ? "border-white/10 bg-black/55 text-white backdrop-blur-md"
              : "border-black/10 bg-[#3D421F] text-[#F0F3DD]",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center gap-2.5 sm:gap-3.5",
              "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-8",
              "pt-[max(0.85rem,env(safe-area-inset-top))] pb-3.5",
            )}
          >
            {venue ? (
              <VenueBrandIcon
                slug={venue.slug}
                name={venue.name}
                isGlobal={venue.is_global}
                primaryColor={venue.primary_color}
                logoUrl={venue.logo_url}
                iconUrl={venue.icon_url}
                faviconUrl={venue.favicon_url}
                variant="wordmark"
                className="h-7 w-auto max-w-[7.5rem] shrink-0 brightness-0 invert sm:h-8 sm:max-w-[9rem]"
                title={venue.name}
              />
            ) : null}
            <h1 className="min-w-0 text-center font-serif text-xl leading-tight text-white sm:text-2xl md:text-[1.65rem]">
              {barTitle}
            </h1>
          </div>
        </header>
      ) : null}
      <form
        ref={formRef}
        noValidate
        className={cn(
          "mx-auto flex w-full min-h-dvh max-w-2xl flex-col space-y-5",
          pagePad,
          barTitle ? "pt-8 md:pt-10" : "py-8 md:py-12",
          "pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-12",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (!reviewing) {
            enterReview();
            return;
          }
          const formEl = event.currentTarget;
          const invalidPage = firstIncompletePage(bodyPages, values, formEl);
          if (invalidPage !== null) {
            setError(
              "Please complete all required fields before submitting.",
            );
            setReviewing(false);
            setBodyPage(invalidPage);
            setReportPage(invalidPage);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
          setError(null);
          persistDraft(values, currentBodyPage);
          const data = new FormData(formEl);
          startTransition(async () => {
            const result = await submitHiringApplication(
              form.public_code,
              data,
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            clearHiringFormDraft(form.public_code);
            setStep("done");
          });
        }}
      >
        {step === "form" ? renderFlowStepper() : null}
        {bodyPages.map((pageBlocks, pageIndex) => (
          <div
            key={`body-page-${pageIndex}`}
            id={`hiring-body-page-${pageIndex}`}
            hidden={reviewing || pageIndex !== currentBodyPage}
            className={
              !reviewing && pageIndex === currentBodyPage
                ? "space-y-5"
                : undefined
            }
          >
            {clusterPageBlocks(pageBlocks).map((cluster) =>
              cluster.type === "matrix" ? (
                <HiringRadioMatrix
                  key={cluster.blocks.map((block) => block.id).join("-")}
                  blocks={cluster.blocks}
                  options={cluster.options}
                  values={values}
                  pending={pending}
                  bodyDark={bodyDark}
                  onValueChange={setFieldValue}
                />
              ) : (
                <HiringPublicBlock
                  key={cluster.block.id}
                  block={cluster.block}
                  bodyDark={bodyDark}
                  pending={pending}
                  todayIso={todayIso}
                  applicantName={applicantName}
                  value={values[cluster.block.id] ?? ""}
                  onValueChange={(value) =>
                    setFieldValue(cluster.block.id, value)
                  }
                />
              ),
            )}
          </div>
        ))}
        {reviewing ? (
          <ReviewAnswers
            pages={bodyPages}
            values={values}
            formEl={formRef.current}
            bodyDark={bodyDark}
            onEditPage={goToPage}
          />
        ) : null}
        {error ? (
          <p className="text-center text-sm text-red-700">{error}</p>
        ) : null}
        {savedNote ? (
          <p
            className={cn(
              "text-center text-sm",
              bodyDark ? "text-white/70" : "text-black/55",
            )}
          >
            {savedNote}
          </p>
        ) : null}
        <PublicNav
          className="mt-0"
          backDisabled={pending}
          onBack={() => {
            if (reviewing) {
              setReviewing(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
              return;
            }
            if (currentBodyPage > 0) {
              goToPage(currentBodyPage - 1);
              return;
            }
            persistDraft(values, currentBodyPage);
            setStep(showIntro2 ? "intro2" : "intro");
          }}
        >
          <Button
            type="button"
            className={publicBtnNav}
            disabled={pending}
            onClick={() => {
              persistDraft(values, currentBodyPage);
              setSavedNote(
                "Saved on this device. Photos and files need to be chosen again before you submit.",
              );
            }}
          >
            Save progress
          </Button>
          {reviewing ? (
            <Button type="submit" className={publicBtnNav} disabled={pending}>
              {pending ? "Sending…" : "Submit application"}
            </Button>
          ) : isLastBodyPage ? (
            <Button
              type="button"
              className={publicBtnNav}
              disabled={pending}
              onClick={enterReview}
            >
              Review answers
            </Button>
          ) : (
            <Button
              type="button"
              className={publicBtnNav}
              disabled={pending}
              onClick={() => goToPage(currentBodyPage + 1)}
            >
              Continue
            </Button>
          )}
        </PublicNav>
      </form>
    </div>
    </>
  );
}

function HiringPublicBlock({
  block,
  bodyDark,
  pending,
  todayIso,
  applicantName,
  value,
  onValueChange,
}: {
  block: HiringFormBlock;
  bodyDark: boolean;
  pending: boolean;
  todayIso: string;
  applicantName: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  if (block.kind === "page") return null;
  if (block.kind === "title") {
    return <SectionTitle bodyDark={bodyDark}>{block.title}</SectionTitle>;
  }
  if (block.kind === "description") {
    return (
      <div
        className={cn(
          "rounded-xl border px-4 py-3.5",
          bodyDark
            ? "border-white/15 bg-white/12"
            : "border-[#c3cb96] bg-[#D8DEB4]",
        )}
      >
        <HiringCopyHtml
          html={fillHiringCopyTokens(block.description ?? "", {
            name: applicantName,
          })}
          className={cn(
            bodyDark
              ? "text-white/90 [&_blockquote]:border-white/25 [&_h3]:text-white [&_hr]:border-white/20"
              : "text-[#3D421F]/80",
          )}
        />
      </div>
    );
  }
  const name = `field_${block.id}`;
  const label = block.field_label || "Field";
  const placeholder = hiringFieldPlaceholder(
    block.field_type ?? "short_text",
    block.config.placeholder,
  );
  const hintClass = bodyDark ? "text-white/50" : "text-black/45";
  const instructionClass = cn(
    "whitespace-pre-wrap text-sm leading-relaxed",
    bodyDark ? "text-white/70" : "text-black/55",
  );
  const instructions = block.config.instructions.trim();
  const instructionNote = instructions ? (
    <p className={instructionClass}>{instructions}</p>
  ) : null;
  const choiceClass = cn(
    "flex items-start gap-2.5 text-sm leading-snug",
    bodyDark ? "text-white" : "text-[#3D421F]",
  );
  const choiceControlClass =
    "mt-0.5 h-4 w-4 shrink-0 accent-[var(--venue-primary,#818a40)]";
  const options = hiringFieldChoiceOptions(
    block.field_type ?? "short_text",
    block.config.options,
  );
  const inputVariant = bodyDark ? "onDark" : "default";
  const selectedChoices = new Set(
    value.split(MULTI_SEP).map((item) => item.trim()).filter(Boolean),
  );

  if (block.field_type === "checkbox") {
    return (
      <div className="space-y-1.5">
        {instructionNote}
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium",
            value === "Yes"
              ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F]"
              : bodyDark
                ? "border-white/20 bg-white/5 text-white"
                : "border-black/12 bg-white text-[#3D421F]",
          )}
        >
          <input
            id={name}
            name={name}
            type="checkbox"
            value="Yes"
            required={block.required}
            disabled={pending}
            checked={value === "Yes"}
            onChange={(event) =>
              onValueChange(event.target.checked ? "Yes" : "")
            }
            className={choiceControlClass}
          />
          <span>
            {label}
            {block.required ? " *" : ""}
          </span>
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} variant={bodyDark ? "onDark" : "default"}>
        {label}
        {block.required ? " *" : ""}
      </Label>
      {instructionNote}
      {block.field_type === "long_text" ? (
        <Textarea
          id={name}
          name={name}
          required={block.required}
          disabled={pending}
          rows={4}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
      ) : block.field_type === "date" ? (
        <DateInput
          id={name}
          name={name}
          value={value}
          onChange={onValueChange}
          disabled={pending}
          required={block.required}
          maxDate={block.config.computeAge ? todayIso : undefined}
          className="w-full"
          inputClassName={inputVariants({ variant: inputVariant })}
          placeholder={placeholder}
        />
      ) : block.field_type === "phone" ? (
        <PhoneWithCountryInput
          id={name}
          name={name}
          value={value}
          onChange={onValueChange}
          disabled={pending}
          required={block.required}
          placeholder={placeholder}
          autoDetectCountry
          inputClassName={inputVariants({
            variant: bodyDark ? "onDark" : "default",
          })}
        />
      ) : block.field_type === "nationality" ? (
        <NationalitySelect
          id={name}
          name={name}
          value={value}
          onChange={onValueChange}
          disabled={pending}
          required={block.required}
          placeholder={placeholder}
          triggerClassName={inputVariants({
            variant: bodyDark ? "onDark" : "default",
          })}
        />
      ) : block.field_type === "yes_no" || block.field_type === "radio" ? (
        <ChoiceCards
          name={name}
          options={options}
          required={block.required}
          disabled={pending}
          value={value}
          bodyDark={bodyDark}
          onChange={onValueChange}
        />
      ) : block.field_type === "dropdown" ? (
        <select
          id={name}
          name={name}
          required={block.required}
          disabled={pending}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={inputVariants({ variant: inputVariant })}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : block.field_type === "multiple_choice" ? (
        <div
          className="space-y-2"
          data-hiring-multi={name}
          data-required={block.required ? "true" : "false"}
        >
          {options.map((option) => {
            const selected = selectedChoices.has(option);
            return (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm",
                  selected
                    ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F]"
                    : bodyDark
                      ? "border-white/20 bg-white/5 text-white"
                      : "border-black/12 bg-white text-[#3D421F]",
                )}
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  disabled={pending}
                  checked={selected}
                  onChange={(event) => {
                    const next = new Set(selectedChoices);
                    if (event.target.checked) next.add(option);
                    else next.delete(option);
                    onValueChange(
                      options.filter((item) => next.has(item)).join(MULTI_SEP),
                    );
                  }}
                  className={choiceControlClass}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      ) : block.field_type === "picture" ? (
        <>
          <Input
            id={name}
            name={name}
            type="file"
            accept="image/*"
            required={block.required}
            disabled={pending}
          />
          <p className={cn("text-xs", hintClass)}>{placeholder}</p>
        </>
      ) : block.field_type === "file" ? (
        <>
          <Input
            id={name}
            name={name}
            type="file"
            multiple={block.config.maxFiles > 1}
            required={block.required}
            disabled={pending}
          />
          <p className={cn("text-xs", hintClass)}>{placeholder}</p>
        </>
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
          placeholder={placeholder}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
    </div>
  );
}
