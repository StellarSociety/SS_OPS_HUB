"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { ArrowLeft, ChevronDown, Images, List, Mail } from "lucide-react";
import { loadMobileHiringPageAction } from "@/lib/actions/mobile-hiring";
import {
  sendHiringInterviewEmail,
  updateHiringApplicationMeta,
} from "@/lib/actions/hr-hiring";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { MobileHiringCalendar } from "@/components/mobile/mobile-hiring-calendar";
import { MobilePressTarget } from "@/components/mobile/mobile-press";
import { useMobileInAppBack } from "@/components/mobile/use-mobile-in-app-back";
import { hiringFieldAnswerText } from "@/lib/hr/hiring/display";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import {
  HIRING_CATEGORIES,
  HIRING_CATEGORY_LABELS,
  HIRING_STATUS_LABELS,
  hiringInterviewConfirmCopy,
  type HiringCategory,
} from "@/lib/hr/hiring/types";
import { toast } from "@/components/ui/toast";
import { mailtoUrl, phoneTelUrl } from "@/lib/directory/links";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type {
  MobileHiringAppointment,
  MobileHiringCandidate,
  MobileHiringField,
  MobileHiringPage,
} from "@/lib/mobile/hiring-replies";
import type { Venue } from "@/lib/types/database";

export type MobileHiringTab = "replies" | "calendar";

type MobileHiringScreenProps = {
  venue: Venue;
  tab?: MobileHiringTab;
  initial: MobileHiringPage;
  canEdit?: boolean;
  appointments?: MobileHiringAppointment[];
  onSelectTab?: (tab: MobileTabItem) => void;
};

function formatSubmittedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MobileHiringScreen({
  venue,
  tab = "replies",
  initial,
  canEdit = false,
  appointments = [],
  onSelectTab,
}: MobileHiringScreenProps) {
  const [page, setPage] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const selected =
    page.candidates.find((candidate) => candidate.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(null);
  }, [tab]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function selectForm(formId: string) {
    if (formId === page.selectedFormId) return;
    setSelectedId(null);
    startTransition(async () => {
      const next = await loadMobileHiringPageAction({
        venueId: venue.id,
        formId,
      });
      if (next) setPage(next);
    });
  }

  const selectedForm = page.forms.find(
    (form) => form.id === page.selectedFormId,
  );

  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      {selected && tab !== "calendar" ? (
        <CandidateDetail
          candidate={selected}
          fields={page.fields}
          form={selectedForm}
          canEdit={canEdit}
          onCandidateUpdate={(candidate) =>
            setPage((current) => ({
              ...current,
              candidates: current.candidates.map((item) =>
                item.id === candidate.id ? candidate : item,
              ),
            }))
          }
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-32 pt-4">
          <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
            {tab === "calendar" ? "Calendar" : "Hiring Forms"}
          </h1>
          <p className="mt-1 text-center text-sm text-black/50 dark:text-white/50">
            {tab === "calendar" ? "Interviews and meetings" : "Candidate replies"}
          </p>
          <hr className="mt-3 border-black/10 dark:border-white/12" />

          {tab === "calendar" ? (
            <MobileHiringCalendar appointments={appointments} />
          ) : page.forms.length === 0 ? (
            <p className="px-1 py-10 text-center text-sm text-black/45 dark:text-white/45">
              No hiring forms yet. Create one in Human Resources to see replies
              here.
            </p>
          ) : (
            <>
              <div className="mt-3">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  Form
                </span>
                <div className="flex items-center gap-2">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">Select hiring form</span>
                    <select
                      value={page.selectedFormId ?? ""}
                      disabled={pending}
                      onChange={(event) => selectForm(event.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-black/10 bg-white/75 px-3 pr-10 text-base text-[#3D421F] outline-none focus:border-[var(--venue-primary,#6B7B3A)] disabled:opacity-60 dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText]"
                    >
                      {page.forms.map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35 dark:text-white/40"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={
                      showThumbnails
                        ? "Show candidates as a list"
                        : "Show candidate thumbnails"
                    }
                    aria-pressed={showThumbnails}
                    title={showThumbnails ? "List view" : "Thumbnail view"}
                    onClick={() => setShowThumbnails((current) => !current)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white/75 text-[#3D421F] outline-none transition-colors active:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#6B7B3A)] dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText] dark:active:bg-white/[0.16]"
                  >
                    {showThumbnails ? (
                      <List aria-hidden className="h-5 w-5" />
                    ) : (
                      <Images aria-hidden className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <p className="mt-3 px-1 text-xs text-black/45 dark:text-white/45">
                {pending
                  ? "Loading replies…"
                  : page.candidates.length === 1
                    ? "1 reply"
                    : `${page.candidates.length} replies`}
                {selectedForm ? ` · ${selectedForm.name}` : null}
              </p>

              <div className={showThumbnails ? "mt-2 grid grid-cols-3 gap-2" : "mt-2 space-y-2"}>
                {page.candidates.length === 0 && !pending ? (
                  <p className={`px-1 py-8 text-center text-sm text-black/45 dark:text-white/45 ${showThumbnails ? "col-span-3" : ""}`}>
                    No replies yet for this form.
                  </p>
                ) : (
                  page.candidates.map((candidate) => (
                    showThumbnails ? (
                      <CandidateThumbnail
                        key={candidate.id}
                        candidate={candidate}
                        fields={page.fields}
                        onOpen={() => setSelectedId(candidate.id)}
                      />
                    ) : (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        onOpen={() => setSelectedId(candidate.id)}
                      />
                    )
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {selected && tab !== "calendar" ? null : (
        <MobileTabBar
          app="hiring"
          activeId={tab === "calendar" ? "calendar" : "replies"}
          venueSlug={venue.slug}
          onSelectTab={onSelectTab}
        />
      )}
    </div>
  );
}

function CandidateThumbnail({
  candidate,
  fields,
  onOpen,
}: {
  candidate: MobileHiringCandidate;
  fields: MobileHiringField[];
  onOpen: () => void;
}) {
  const position = candidateFieldText(candidate, fields, (field) =>
    /position/i.test(field.label),
  );
  const nationalityText = candidateFieldText(
    candidate,
    fields,
    (field) => field.type === "nationality" || /nationality/i.test(field.label),
  );
  const nationality = nationalityDisplay(nationalityText);

  return (
    <MobilePressTarget
      onClick={onOpen}
      aria-label={`Open ${shortCandidateName(candidate.name)}`}
      className="min-w-0 rounded-2xl border border-black/10 bg-white/75 p-1.5 text-left dark:border-white/12 dark:bg-white/10"
    >
      {candidate.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.photoUrl}
          alt=""
          className="aspect-square w-full rounded-xl object-cover"
        />
      ) : (
        <span className="flex aspect-square w-full items-center justify-center rounded-xl bg-[var(--venue-primary,#818a40)]/15 text-xl font-medium text-[#3D421F] dark:text-[CanvasText]">
          {shortCandidateName(candidate.name).charAt(0).toUpperCase()}
        </span>
      )}
      <span className="mt-1.5 block truncate px-0.5 text-center text-[11px] font-medium leading-4 text-[#3D421F] dark:text-[CanvasText]">
        {shortCandidateName(candidate.name)}
      </span>
      <span className="block truncate px-0.5 text-center text-[10px] leading-3.5 text-black/50 dark:text-white/50">
        {position || "Position not provided"}
      </span>
      <span className="block truncate px-0.5 pb-0.5 text-center text-[10px] leading-3.5 text-black/45 dark:text-white/45">
        {nationality
          ? [nationality.label, nationality.flag].filter(Boolean).join(" ")
          : "Nationality not provided"}
      </span>
    </MobilePressTarget>
  );
}

function shortCandidateName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) =>
      part
        .toLocaleLowerCase()
        .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase()),
    )
    .join(" ");
}

function candidateFieldText(
  candidate: MobileHiringCandidate,
  fields: MobileHiringField[],
  matches: (field: MobileHiringField) => boolean,
): string {
  for (const field of fields.filter(matches)) {
    const text = hiringFieldAnswerText({
      value: candidate.answers[field.id]?.value,
      files: candidate.files.filter((file) => file.block_id === field.id),
      fieldType: field.type,
      computeAge: field.computeAge,
    }).trim();
    if (text && text !== "—") return text;
  }
  for (const [id, answer] of Object.entries(candidate.answers)) {
    const field: MobileHiringField = {
      id,
      label: answer.label || "Field",
      type: answer.type,
      computeAge: false,
    };
    if (!matches(field)) continue;
    const text = hiringFieldAnswerText({
      value: answer.value,
      files: candidate.files.filter((file) => file.block_id === id),
      fieldType: field.type,
      computeAge: false,
    }).trim();
    if (text && text !== "—") return text;
  }
  return "";
}

function CandidateCard({
  candidate,
  onOpen,
}: {
  candidate: MobileHiringCandidate;
  onOpen: () => void;
}) {
  return (
    <MobilePressTarget
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white/75 px-3 py-2.5 text-left dark:border-white/12 dark:bg-white/10"
    >
      <CandidateAvatar candidate={candidate} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-[#3D421F] dark:text-[CanvasText]">
          {shortCandidateName(candidate.name)}
        </span>
        <span className="mt-0.5 block truncate text-xs text-black/50 dark:text-white/50">
          {candidate.email || "No email"}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-black/45 dark:text-white/45">
          <span>{formatSubmittedAt(candidate.submittedAt)}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{candidate.statusLabel}</span>
        </span>
      </span>
    </MobilePressTarget>
  );
}

function CandidateDetail({
  candidate,
  fields,
  form,
  canEdit,
  onCandidateUpdate,
  onBack,
}: {
  candidate: MobileHiringCandidate;
  fields: MobileHiringField[];
  form: MobileHiringPage["forms"][number] | undefined;
  canEdit: boolean;
  onCandidateUpdate: (candidate: MobileHiringCandidate) => void;
  onBack: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [emailKind, setEmailKind] = useState<"request" | "confirm" | null>(null);
  const [format, setFormat] = useState<"in_person" | "video">("in_person");
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const rootRef = useMobileInAppBack<HTMLDivElement>(onBack);
  const mail = mailtoUrl(candidate.email);
  const fieldIds = new Set(fields.map((field) => field.id));
  const extraAnswers = Object.entries(candidate.answers).filter(
    ([id]) => !fieldIds.has(id),
  );

  function openEmail(kind: "request" | "confirm") {
    if (!form) return;
    setEmailKind(kind);
    if (kind === "request") {
      setSubject(form.interviewRequestSubject);
      setBody(form.interviewRequestBody);
      return;
    }
    const copy = hiringInterviewConfirmCopy(
      {
        interview_confirm_subject: form.interviewConfirmSubject,
        interview_confirm_body: form.interviewConfirmBody,
        interview_confirm_video_subject: form.interviewConfirmVideoSubject,
        interview_confirm_video_body: form.interviewConfirmVideoBody,
      },
      format,
    );
    setSubject(copy.subject);
    setBody(copy.body);
  }

  function updateCategory(value: string) {
    const category = (value || null) as HiringCategory | null;
    startTransition(async () => {
      const result = await updateHiringApplicationMeta({
        applicationId: candidate.id,
        category,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onCandidateUpdate({
        ...candidate,
        category,
        categoryLabel: category ? HIRING_CATEGORY_LABELS[category] : null,
      });
      toast.saved("Candidate category updated.");
    });
  }

  function sendEmail() {
    if (!emailKind) return;
    startTransition(async () => {
      const result = await sendHiringInterviewEmail({
        applicationId: candidate.id,
        kind: emailKind,
        format,
        locationDetails: location,
        meetingLink,
        date,
        time,
        subject,
        body,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const status =
        emailKind === "confirm" ? "interview_scheduled" : "interview_request_sent";
      onCandidateUpdate({
        ...candidate,
        status,
        statusLabel: HIRING_STATUS_LABELS[status],
      });
      toast.saved(
        emailKind === "confirm"
          ? "Interview confirmed and added to the calendar."
          : "Interview request sent.",
      );
      setEmailKind(null);
    });
  }

  return (
    <div ref={rootRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-full px-1 py-1 text-sm font-medium text-[#3D421F] dark:text-[CanvasText]"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Hiring Forms
      </button>

      <div className="mt-3 flex flex-col items-center gap-3">
        <CandidateAvatar candidate={candidate} size="lg" />
        <div className="text-center">
          <p className="font-serif text-xl text-[#3D421F] dark:text-[CanvasText]">
            {shortCandidateName(candidate.name)}
          </p>
          {mail ? (
            <a
              href={mail}
              className="mt-0.5 block text-sm text-[var(--venue-primary,#6B7B3A)] underline-offset-2 hover:underline"
            >
              {candidate.email}
            </a>
          ) : (
            <p className="mt-0.5 text-sm text-black/50 dark:text-white/50">
              {candidate.email || "No email"}
            </p>
          )}
          <p className="mt-1 text-xs text-black/40 dark:text-white/40">
            {form?.name ?? "Hiring Forms"}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2 rounded-2xl border border-black/10 bg-white/75 p-3 dark:border-white/12 dark:bg-white/10">
        <DetailRow label="Submitted" value={formatSubmittedAt(candidate.submittedAt)} />
        <DetailRow label="Status" value={candidate.statusLabel} />
        {canEdit ? (
          <label className="block rounded-xl px-1 py-1.5">
            <span className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
              Category
            </span>
            <select
              value={candidate.category ?? ""}
              disabled={pending}
              onChange={(event) => updateCategory(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-base text-[#3D421F] outline-none dark:border-white/12 dark:bg-black/20 dark:text-[CanvasText]"
            >
              <option value="">Not set</option>
              {HIRING_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {HIRING_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <DetailRow label="Category" value={candidate.categoryLabel || "—"} />
        )}
      </div>

      {canEdit ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending || !candidate.email}
            onClick={() => openEmail("request")}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/75 px-2 text-sm font-medium text-[#3D421F] disabled:opacity-45 dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText]"
          >
            <Mail aria-hidden className="h-4 w-4" />
            Request availability
          </button>
          <button
            type="button"
            disabled={pending || !candidate.email}
            onClick={() => openEmail("confirm")}
            className="min-h-12 rounded-xl bg-[var(--venue-primary,#6B7B3A)] px-2 text-sm font-medium text-white disabled:opacity-45"
          >
            Confirm interview
          </button>
        </div>
      ) : null}

      {emailKind ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-black/10 bg-white/90 p-3 dark:border-white/12 dark:bg-white/10">
          <div className="flex items-center justify-between gap-3">
            <p className="font-serif text-lg text-[#3D421F] dark:text-[CanvasText]">
              {emailKind === "confirm" ? "Confirm interview" : "Request availability"}
            </p>
            <button type="button" onClick={() => setEmailKind(null)} className="text-sm text-black/50 dark:text-white/50">
              Cancel
            </button>
          </div>
          {emailKind === "confirm" ? (
            <>
              <MobileField label="Interview format">
                <select
                  value={format}
                  onChange={(event) => {
                    const next = event.target.value as "in_person" | "video";
                    setFormat(next);
                    if (!form) return;
                    const copy = hiringInterviewConfirmCopy(
                      {
                        interview_confirm_subject: form.interviewConfirmSubject,
                        interview_confirm_body: form.interviewConfirmBody,
                        interview_confirm_video_subject: form.interviewConfirmVideoSubject,
                        interview_confirm_video_body: form.interviewConfirmVideoBody,
                      },
                      next,
                    );
                    setSubject(copy.subject);
                    setBody(copy.body);
                  }}
                  className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-base text-[#3D421F] dark:border-white/12 dark:bg-black/20 dark:text-[CanvasText]"
                >
                  <option value="in_person">In person</option>
                  <option value="video">Video call</option>
                </select>
              </MobileField>
              <MobileField label={format === "video" ? "Meeting link" : "Location details"}>
                <input
                  value={format === "video" ? meetingLink : location}
                  onChange={(event) =>
                    format === "video"
                      ? setMeetingLink(event.target.value)
                      : setLocation(event.target.value)
                  }
                  className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-base text-[#3D421F] dark:border-white/12 dark:bg-black/20 dark:text-[CanvasText]"
                />
              </MobileField>
              <div className="grid grid-cols-2 gap-2">
                <MobileField label="Date">
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-11 w-full rounded-xl border border-black/10 bg-white px-2 text-sm text-[#3D421F] dark:border-white/12 dark:bg-black/20 dark:text-[CanvasText]" />
                </MobileField>
                <MobileField label="Time">
                  <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-11 w-full rounded-xl border border-black/10 bg-white px-2 text-sm text-[#3D421F] dark:border-white/12 dark:bg-black/20 dark:text-[CanvasText]" />
                </MobileField>
              </div>
            </>
          ) : null}
          <MobileField label="Subject">
            <input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-base text-[#3D421F] dark:border-white/12 dark:bg-black/20 dark:text-[CanvasText]" />
          </MobileField>
          <MobileField label="Message">
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-base text-[#3D421F] dark:border-white/12 dark:bg-black/20 dark:text-[CanvasText]" />
          </MobileField>
          <button
            type="button"
            disabled={pending}
            onClick={sendEmail}
            className="h-12 w-full rounded-xl bg-[var(--venue-primary,#6B7B3A)] font-medium text-white disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send email"}
          </button>
        </div>
      ) : null}

      {fields.length > 0 || extraAnswers.length > 0 ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-black/10 bg-white/75 p-3 dark:border-white/12 dark:bg-white/10">
          {fields.map((field) => (
            <AnswerRow
              key={field.id}
              candidate={candidate}
              field={field}
            />
          ))}
          {extraAnswers.map(([id, answer]) => (
            <AnswerRow
              key={id}
              candidate={candidate}
              field={{
                id,
                label: answer.label || "Field",
                type: answer.type,
                computeAge: false,
              }}
            />
          ))}
        </div>
      ) : (
        <p className="mt-6 px-1 text-center text-sm text-black/45 dark:text-white/45">
          No submitted answers on this reply.
        </p>
      )}
    </div>
  );
}

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-black/55 dark:text-white/55">{label}</span>
      {children}
    </label>
  );
}

function AnswerRow({
  candidate,
  field,
}: {
  candidate: MobileHiringCandidate;
  field: MobileHiringField;
}) {
  const files = candidate.files.filter((file) => file.block_id === field.id);
  const text = hiringFieldAnswerText({
    value: candidate.answers[field.id]?.value,
    files,
    fieldType: field.type,
    computeAge: field.computeAge,
  });
  const raw = candidate.answers[field.id]?.value;
  const scalar = typeof raw === "string" ? raw : text;
  const href =
    field.type === "email"
      ? mailtoUrl(scalar)
      : field.type === "phone"
        ? phoneTelUrl(scalar)
        : null;

  if (field.type === "picture" && files[0]) {
    return (
      <div className="rounded-xl px-1 py-1.5">
        <p className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
          {field.label}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={files[0].public_url}
          alt=""
          className="mt-1.5 h-28 w-28 rounded-2xl object-cover"
        />
      </div>
    );
  }

  if (field.type === "file" && files.length > 0) {
    return (
      <div className="rounded-xl px-1 py-1.5">
        <p className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
          {field.label}
        </p>
        <ul className="mt-1 space-y-1">
          {files.map((file) => (
            <li key={file.id}>
              <a
                href={file.public_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--venue-primary,#6B7B3A)] underline-offset-2 hover:underline"
              >
                {file.file_name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <DetailRow
      label={field.label}
      value={text || "—"}
      href={href}
      wrap={field.type === "long_text"}
    />
  );
}

function DetailRow({
  label,
  value,
  href,
  wrap = false,
}: {
  label: string;
  value: string;
  href?: string | null;
  wrap?: boolean;
}) {
  const content = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm text-[#3D421F] dark:text-[CanvasText] ${
          wrap ? "whitespace-pre-wrap" : "break-all"
        }`}
      >
        {value}
      </p>
    </>
  );

  if (!href) {
    return <div className="rounded-xl px-1 py-1.5">{content}</div>;
  }

  return (
    <a
      href={href}
      className="block rounded-xl px-1 py-1.5 underline-offset-2 hover:bg-black/[0.04] hover:underline dark:hover:bg-white/[0.06]"
    >
      {content}
    </a>
  );
}

function CandidateAvatar({
  candidate,
  size,
}: {
  candidate: MobileHiringCandidate;
  size: "md" | "lg";
}) {
  const box = size === "lg" ? "h-24 w-24 text-2xl" : "h-12 w-12 text-sm";
  if (candidate.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={candidate.photoUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ${
          size === "lg" ? "h-24 w-24" : "h-12 w-12"
        }`}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)]/15 font-medium text-[#3D421F] dark:text-[CanvasText] ${box}`}
    >
      {shortCandidateName(candidate.name).charAt(0).toUpperCase()}
    </span>
  );
}
