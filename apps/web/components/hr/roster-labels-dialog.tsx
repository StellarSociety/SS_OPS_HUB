"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import {
  scheduleDayLabelStyle,
  type ScheduleDayLabel,
} from "@/lib/hr/schedules";

type RosterLabelsDialogProps = {
  open: boolean;
  labels: ScheduleDayLabel[];
  onClose: () => void;
};

/** Duty / roster codes shown first. */
const ROSTER_CODES = ["SHIFT", "OFF", "PH-REPL"] as const;
/** Paid leave kinds. */
const PAID_LEAVE_CODES = ["AL", "PH", "SL", "ML", "PL", "BL", "LD"] as const;
/** Unpaid leave / absence kinds. */
const UNPAID_LEAVE_CODES = ["UPL", "ABS"] as const;

type LabelSection = {
  key: string;
  title: string | null;
  labels: ScheduleDayLabel[];
};

function orderByCodeList(
  labels: ScheduleDayLabel[],
  codes: readonly string[],
): ScheduleDayLabel[] {
  const byCode = new Map(labels.map((l) => [l.code.toUpperCase(), l]));
  const ordered: ScheduleDayLabel[] = [];
  for (const code of codes) {
    const label = byCode.get(code);
    if (label) ordered.push(label);
  }
  return ordered;
}

function buildLabelSections(labels: ScheduleDayLabel[]): LabelSection[] {
  const used = new Set<string>();
  const take = (codes: readonly string[]) => {
    const ordered = orderByCodeList(labels, codes);
    for (const l of ordered) used.add(l.code.toUpperCase());
    return ordered;
  };

  const sections: LabelSection[] = [
    { key: "roster", title: null, labels: take(ROSTER_CODES) },
    {
      key: "paid",
      title: "Paid leave",
      labels: take(PAID_LEAVE_CODES),
    },
    {
      key: "unpaid",
      title: "Unpaid leave",
      labels: take(UNPAID_LEAVE_CODES),
    },
  ];

  const other = labels
    .filter((l) => !used.has(l.code.toUpperCase()))
    .slice()
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.code.localeCompare(b.code),
    );
  if (other.length > 0) {
    sections.push({ key: "other", title: "Other", labels: other });
  }

  return sections.filter((s) => s.labels.length > 0);
}

export function RosterLabelsDialog({
  open,
  labels,
  onClose,
}: RosterLabelsDialogProps) {
  const sections = buildLabelSections(labels);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Roster labels"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Schedules
            </p>
            <h2 className="font-serif text-xl text-[#3D421F]">Roster labels</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="max-h-[min(60vh,28rem)] space-y-4 overflow-y-auto px-5 py-4">
          {sections.map((section, index) => (
            <section
              key={section.key}
              aria-labelledby={
                section.title
                  ? `roster-label-section-${section.key}`
                  : undefined
              }
            >
              {index > 0 ? (
                <div className="mb-3 border-t border-black/10" aria-hidden />
              ) : null}
              {section.title ? (
                <h3
                  id={`roster-label-section-${section.key}`}
                  className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40"
                >
                  {section.title}
                </h3>
              ) : null}
              <ul className="space-y-1.5">
                {section.labels.map((label) => (
                  <li key={label.code} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 inline-flex min-w-[3.25rem] shrink-0 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={scheduleDayLabelStyle(label)}
                    >
                      {label.abbreviation}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm text-[#3D421F]">{label.name}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
