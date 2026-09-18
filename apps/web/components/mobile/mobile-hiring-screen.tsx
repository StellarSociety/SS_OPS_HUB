"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { loadMobileHiringPageAction } from "@/lib/actions/mobile-hiring";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { MobileHiringCalendar } from "@/components/mobile/mobile-hiring-calendar";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type {
  MobileHiringAppointment,
  MobileHiringCandidate,
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

  function selectForm(formId: string) {
    if (formId === page.selectedFormId) return;
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
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))
              )}
            </div>
          </>
        )}
      </div>

      <MobileTabBar
        app="hiring"
        activeId={tab === "calendar" ? "calendar" : "replies"}
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: MobileHiringCandidate }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white/75 px-3 py-2.5 dark:border-white/12 dark:bg-white/10">
      {candidate.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.photoUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)]/15 text-sm font-medium text-[#3D421F] dark:text-[CanvasText]">
          {candidate.name.charAt(0).toUpperCase()}
        </span>
      )}
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
    </div>
  );
}
