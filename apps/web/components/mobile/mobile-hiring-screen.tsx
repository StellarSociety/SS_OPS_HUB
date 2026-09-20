"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { loadMobileHiringPageAction } from "@/lib/actions/mobile-hiring";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { MobileHiringCalendar } from "@/components/mobile/mobile-hiring-calendar";
import { MobilePressTarget } from "@/components/mobile/mobile-press";
import { useMobileInAppBack } from "@/components/mobile/use-mobile-in-app-back";
import { hiringFieldAnswerText } from "@/lib/hr/hiring/display";
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
  appointments = [],
  onSelectTab,
}: MobileHiringScreenProps) {
  const [page, setPage] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
          formName={selectedForm?.name ?? "Hiring Forms"}
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
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
                  Form
                </span>
                <span className="relative block">
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
                </span>
              </label>

              <p className="mt-3 px-1 text-xs text-black/45 dark:text-white/45">
                {pending
                  ? "Loading replies…"
                  : page.candidates.length === 1
                    ? "1 reply"
                    : `${page.candidates.length} replies`}
                {selectedForm ? ` · ${selectedForm.name}` : null}
              </p>

              <div className="mt-2 space-y-2">
                {page.candidates.length === 0 && !pending ? (
                  <p className="px-1 py-8 text-center text-sm text-black/45 dark:text-white/45">
                    No replies yet for this form.
                  </p>
                ) : (
                  page.candidates.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      onOpen={() => setSelectedId(candidate.id)}
                    />
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
          {candidate.name}
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
  formName,
  onBack,
}: {
  candidate: MobileHiringCandidate;
  fields: MobileHiringField[];
  formName: string;
  onBack: () => void;
}) {
  const rootRef = useMobileInAppBack<HTMLDivElement>(onBack);
  const mail = mailtoUrl(candidate.email);
  const fieldIds = new Set(fields.map((field) => field.id));
  const extraAnswers = Object.entries(candidate.answers).filter(
    ([id]) => !fieldIds.has(id),
  );

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
            {candidate.name}
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
            {formName}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2 rounded-2xl border border-black/10 bg-white/75 p-3 dark:border-white/12 dark:bg-white/10">
        <DetailRow label="Submitted" value={formatSubmittedAt(candidate.submittedAt)} />
        <DetailRow label="Status" value={candidate.statusLabel} />
        <DetailRow label="Category" value={candidate.categoryLabel || "—"} />
      </div>

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
      {candidate.name.charAt(0).toUpperCase()}
    </span>
  );
}
