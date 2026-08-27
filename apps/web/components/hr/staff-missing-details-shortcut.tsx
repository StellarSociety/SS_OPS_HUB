"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Paperclip, X } from "lucide-react";
import type { StaffEntryTab } from "@/components/hr/staff-entry-form";
import { Button } from "@/components/ui/button";
import { getStaffProfileDocumentIndex } from "@/lib/actions/hr-workdrive";
import {
  listProfileMissingItems,
  type ProfileDocumentPresence,
  type ProfileDocumentSlotPart,
  type ProfileMissingHit,
  type ProfileMissingTab,
} from "@/lib/hr/profile-completeness";
import type { StaffFormState } from "@/lib/hr/staff-form";
import { verticalSegmentedSubNavLinkClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

const TAB_SECTIONS: { tab: ProfileMissingTab; label: string }[] = [
  { tab: "identity", label: "Identity" },
  { tab: "contact", label: "Contact" },
  { tab: "employment", label: "Employment" },
  { tab: "documents", label: "Personal Doc's" },
  { tab: "employment_docs", label: "Employment Doc's" },
];

type StaffMissingDetailsShortcutProps = {
  staffId: string;
  form: StaffFormState;
  photoUrl?: string | null;
  canViewSalary: boolean;
  canEdit: boolean;
  onOpenTab: (tab: StaffEntryTab) => void;
  onRequestEdit?: () => void;
};

export function StaffMissingDetailsShortcut({
  staffId,
  form,
  photoUrl = null,
  canViewSalary,
  canEdit,
  onOpenTab,
  onRequestEdit,
}: StaffMissingDetailsShortcutProps) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState<ProfileDocumentPresence[]>([]);
  const [venueSlots, setVenueSlots] = useState<
    Record<string, ProfileDocumentSlotPart[]> | undefined
  >(undefined);

  const loadDocuments = useCallback(async () => {
    const result = await getStaffProfileDocumentIndex(staffId);
    if (!result.ok) return;
    setPresent(result.present);
    setVenueSlots(result.slots);
  }, [staffId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (open) void loadDocuments();
  }, [open, loadDocuments]);

  const items = useMemo(
    () =>
      listProfileMissingItems(form, {
        canViewSalary,
        photoUrl,
        present,
        venueSlots,
      }),
    [form, canViewSalary, photoUrl, present, venueSlots],
  );

  const count = items.length;
  const grouped = useMemo(
    () =>
      TAB_SECTIONS.map((section) => ({
        ...section,
        items: items.filter((item) => item.tab === section.tab),
      })).filter((section) => section.items.length > 0),
    [items],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function goToField(item: ProfileMissingHit) {
    setOpen(false);
    onOpenTab(item.tab);
    if (canEdit) onRequestEdit?.();
    window.setTimeout(
      () => {
        document.getElementById(item.anchorId)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      },
      item.kind === "attachment" ? 220 : 80,
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={verticalSegmentedSubNavLinkClass(open)}
        title={
          count === 0
            ? "No missing profile details or attachments"
            : `Open ${count} missing profile detail${count === 1 ? "" : "s"}`
        }
      >
        <ClipboardList className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
        <span className="min-w-0 truncate">Missing</span>
        <span
          className={cn(
            "shrink-0 tabular-nums",
            count > 0 ? "text-red-600" : "text-black/35",
          )}
        >
          ({count})
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="staff-missing-details-title"
                className="relative w-full max-w-lg rounded-2xl border border-black/10 bg-white p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="absolute right-4 top-4 rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2
                  id="staff-missing-details-title"
                  className="pr-8 font-serif text-xl text-[#3D421F]"
                >
                  Missing details{" "}
                  <span
                    className={cn(
                      "tabular-nums",
                      count > 0 ? "text-red-600" : "text-black/35",
                    )}
                  >
                    ({count})
                  </span>
                </h2>
                <p className="mt-1 text-sm text-black/55">
                  {count === 0
                    ? "This profile has all tracked fields and attachments filled in."
                    : canEdit
                      ? "Select a field or file to jump to it on the profile."
                      : "Fields and attachments still empty on this profile."}
                </p>

                {count > 0 ? (
                  <div className="mt-4 max-h-[min(70vh,36rem)] space-y-3 overflow-y-auto pr-1">
                    {grouped.map((section) => (
                      <div key={section.tab}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">
                          {section.label}
                        </p>
                        <ul className="overflow-hidden rounded-lg border border-black/10">
                          {section.items.map((item) => (
                            <li
                              key={item.field}
                              className="border-b border-black/5 last:border-b-0"
                            >
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => goToField(item)}
                                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/50"
                                >
                                  <span className="min-w-0">{item.label}</span>
                                  <span className="inline-flex shrink-0 items-center gap-2">
                                    {item.kind === "attachment" ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-black/45">
                                        <Paperclip
                                          className="h-3 w-3"
                                          aria-hidden
                                        />
                                        File
                                      </span>
                                    ) : null}
                                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-black/35">
                                      Go
                                    </span>
                                  </span>
                                </button>
                              ) : (
                                <p className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-[#3D421F]">
                                  <span>{item.label}</span>
                                  {item.kind === "attachment" ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-black/45">
                                      <Paperclip
                                        className="h-3 w-3"
                                        aria-hidden
                                      />
                                      File
                                    </span>
                                  ) : null}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
