"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  LayoutGrid,
  List,
  Settings2,
} from "lucide-react";
import { HiringDialog } from "@/components/hr/hiring-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  saveHiringForm,
  saveHiringFormNotifications,
  sendHiringInterviewEmail,
  updateHiringApplicationMeta,
} from "@/lib/actions/hr-hiring";
import { hiringAnswerDisplay, hiringPictureUrl, hiringShortName } from "@/lib/hr/hiring/display";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import type { HiringNotifyCandidate } from "@/lib/hr/hiring/notify";
import {
  HIRING_CATEGORIES,
  HIRING_CATEGORY_LABELS,
  HIRING_STATUS_LABELS,
  HIRING_APPLICATION_STATUSES,
  hiringInterviewConfirmCopy,
  type HiringApplication,
  type HiringApplicationStatus,
  type HiringCategory,
  type HiringForm,
  type HiringFormBlock,
} from "@/lib/hr/hiring/types";

const selectClass =
  "h-11 w-full rounded-md border border-black/10 bg-white px-3 text-base text-[#3D421F] sm:h-10 sm:text-sm";

function fieldBlocks(blocks: HiringFormBlock[]) {
  return blocks.filter((block) => block.kind === "field");
}

function formatSubmittedAt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SortableHeader({
  label,
  fieldId,
  sortFieldId,
  sortDirection,
  onSort,
}: {
  label: string;
  fieldId: string;
  sortFieldId: string;
  sortDirection: "asc" | "desc";
  onSort: (fieldId: string) => void;
}) {
  const active = sortFieldId === fieldId;
  return (
    <th
      className="px-3 py-2 font-medium"
      aria-sort={
        active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(fieldId)}
        className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-[#3D421F]"
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {active ? (
          sortDirection === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-black/25" />
        )}
      </button>
    </th>
  );
}

export function HiringRepliesClient({
  forms,
  selectedForm,
  blocks,
  applications,
  notifyCandidates,
  canEdit,
}: {
  forms: HiringForm[];
  selectedForm: HiringForm | null;
  blocks: HiringFormBlock[];
  applications: HiringApplication[];
  notifyCandidates: HiringNotifyCandidate[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [viewOpen, setViewOpen] = useState(false);
  // Table rows or candidate thumbnails (as on the phone). Kept in the URL
  // (?view=thumbnails) so it survives switching forms and reloads.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const layout: "table" | "thumbnails" =
    searchParams.get("view") === "thumbnails" ? "thumbnails" : "table";
  function setLayout(next: "table" | "thumbnails") {
    router.replace(next === "thumbnails" ? `${pathname}?view=thumbnails` : pathname, { scroll: false });
  }
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyByForm, setNotifyByForm] = useState<Record<string, string[]>>(
    () =>
      Object.fromEntries(
        forms.map((form) => [form.id, form.notify_user_ids ?? []]),
      ),
  );
  const [detail, setDetail] = useState<HiringApplication | null>(null);
  const [interviewKind, setInterviewKind] = useState<"request" | "confirm" | null>(
    null,
  );
  const [visibleIds, setVisibleIds] = useState<string[]>(
    selectedForm?.table_column_ids?.length
      ? selectedForm.table_column_ids
      : fieldBlocks(blocks).map((block) => block.id),
  );
  const [sortFieldId, setSortFieldId] = useState(
    selectedForm?.sort_field_id ?? "submitted_at",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    selectedForm?.sort_direction ?? "desc",
  );
  const [format, setFormat] = useState<"in_person" | "video">("in_person");
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const allFieldIds = fieldBlocks(blocks).map((block) => block.id);
  const allFieldsSelected =
    allFieldIds.length > 0 &&
    allFieldIds.every((id) => visibleIds.includes(id));
  const someFieldsSelected = allFieldIds.some((id) => visibleIds.includes(id));

  const columns = fieldBlocks(blocks).filter((block) =>
    visibleIds.includes(block.id),
  );

  const notifyOptions = useMemo(
    () =>
      notifyCandidates.map((candidate) => ({
        value: candidate.id,
        label: candidate.label,
        searchText: candidate.searchText,
      })),
    [notifyCandidates],
  );

  const sorted = useMemo(() => {
    const copy = [...applications];
    copy.sort((a, b) => {
      let left = "";
      let right = "";
      if (sortFieldId === "submitted_at") {
        left = a.submitted_at;
        right = b.submitted_at;
      } else if (sortFieldId === "category") {
        left = a.category ? HIRING_CATEGORY_LABELS[a.category] : "";
        right = b.category ? HIRING_CATEGORY_LABELS[b.category] : "";
      } else if (sortFieldId === "status") {
        left = HIRING_STATUS_LABELS[a.status];
        right = HIRING_STATUS_LABELS[b.status];
      } else {
        const block = blocks.find((item) => item.id === sortFieldId);
        left = hiringAnswerDisplay(a, block);
        right = hiringAnswerDisplay(b, block);
      }
      const cmp = left.localeCompare(right, undefined, { numeric: true });
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [applications, blocks, sortDirection, sortFieldId]);

  function toggleSort(fieldId: string) {
    if (sortFieldId === fieldId) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortFieldId(fieldId);
    setSortDirection(fieldId === "submitted_at" ? "desc" : "asc");
  }

  function openInterview(kind: "request" | "confirm") {
    if (!detail || !selectedForm) return;
    setInterviewKind(kind);
    if (kind === "request") {
      setSubject(selectedForm.interview_request_subject);
      setBody(selectedForm.interview_request_body);
    } else {
      const copy = hiringInterviewConfirmCopy(selectedForm, format);
      setSubject(copy.subject);
      setBody(copy.body);
    }
  }

  if (forms.length === 0) {
    return (
      <Card className="px-6 py-16 text-center text-sm text-muted-foreground">
        Create a hiring form first, then replies will land here.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="w-full space-y-1.5 sm:w-auto">
          <Label htmlFor="hiring-form-select">Form</Label>
          <select
            id="hiring-form-select"
            className={`${selectClass} sm:min-w-56`}
            value={selectedForm?.id ?? ""}
            onChange={(event) => {
              router.push(
                toScopedHref(
                  `/hr/hiring/replies/${event.target.value}`,
                  scope,
                  slug,
                ) + (layout === "thumbnails" ? "?view=thumbnails" : ""),
              );
            }}
          >
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
        </div>
        {forms.length > 0 ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full sm:h-10 sm:w-auto"
              onClick={() => {
                setNotifyByForm(
                  Object.fromEntries(
                    forms.map((form) => [form.id, form.notify_user_ids ?? []]),
                  ),
                );
                setNotifyOpen(true);
              }}
            >
              <Bell className="h-4 w-4" />
              Notifications
            </Button>
            {selectedForm ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full sm:h-10 sm:w-auto"
                onClick={() => setViewOpen(true)}
              >
                <Settings2 className="h-4 w-4" />
                View settings
              </Button>
            ) : null}
            {selectedForm ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full sm:h-10 sm:w-10 sm:px-0"
                onClick={() => setLayout(layout === "table" ? "thumbnails" : "table")}
                aria-pressed={layout === "thumbnails"}
                aria-label={layout === "thumbnails" ? "Show replies as a table" : "Show candidate thumbnails"}
                title={layout === "thumbnails" ? "Table view" : "Thumbnail view"}
              >
                {layout === "thumbnails" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                <span className="sm:sr-only">{layout === "thumbnails" ? "Table view" : "Thumbnail view"}</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!selectedForm ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          Choose a form to see its replies.
        </Card>
      ) : sorted.length === 0 ? (
        <Card className="px-6 py-16 text-center text-sm text-muted-foreground">
          No replies yet. Share the form link from Forms Builder.
        </Card>
      ) : layout === "thumbnails" ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {sorted.map((application) => (
            <li key={application.id}>
              <CandidateThumbnail
                application={application}
                blocks={blocks}
                onOpen={() => setDetail(application)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {sorted.map((application) => {
              const photo = hiringPictureUrl(application, blocks);
              const name = application.applicant_name || "Unnamed";
              return (
                <button
                  key={application.id}
                  type="button"
                  onClick={() => setDetail(application)}
                  className="flex w-full min-h-16 items-center gap-3 rounded-xl border border-black/10 bg-white/80 p-3 text-left active:bg-[var(--venue-primary,#818a40)]/8"
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)]/15 text-sm font-medium text-[#3D421F]">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[#3D421F]">
                      {name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-black/50">
                      {application.applicant_email || "No email"}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-black/55">
                      <span>{formatSubmittedAt(application.submitted_at)}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">
                        {HIRING_STATUS_LABELS[application.status]}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-black/25"
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-black/10 bg-white/70 md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <SortableHeader
                  label="Submitted"
                  fieldId="submitted_at"
                  sortFieldId={sortFieldId}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
                {columns.map((column) => (
                  <SortableHeader
                    key={column.id}
                    label={column.field_label || "Field"}
                    fieldId={column.id}
                    sortFieldId={sortFieldId}
                    sortDirection={sortDirection}
                    onSort={toggleSort}
                  />
                ))}
                <SortableHeader
                  label="Category"
                  fieldId="category"
                  sortFieldId={sortFieldId}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Status"
                  fieldId="status"
                  sortFieldId={sortFieldId}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((application) => {
                const photo = hiringPictureUrl(application, blocks);
                return (
                  <tr
                    key={application.id}
                    className="cursor-pointer border-t border-black/5 hover:bg-[var(--venue-primary,#818a40)]/8"
                    onClick={() => setDetail(application)}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-black/60">
                      {formatSubmittedAt(application.submitted_at)}
                    </td>
                    {columns.map((column) => {
                      const display = hiringAnswerDisplay(application, column);
                      return (
                        <td key={column.id} className="px-3 py-2">
                          {column.field_type === "picture" && (photo || display) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo || display}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-[#3D421F]">{display || "—"}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      {application.category
                        ? HIRING_CATEGORY_LABELS[application.category]
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-black/70">
                      {HIRING_STATUS_LABELS[application.status]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <HiringDialog
        open={viewOpen}
        title="Replies view"
        description="Choose which fields appear on each row, and how the list is sorted."
        onClose={() => setViewOpen(false)}
        busy={pending}
        footer={
          canEdit && selectedForm ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await saveHiringForm(selectedForm.id, {
                    table_column_ids: visibleIds,
                    sort_field_id: allFieldIds.includes(sortFieldId)
                      ? sortFieldId
                      : null,
                    sort_direction: sortDirection,
                  });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.saved("View saved.");
                  setViewOpen(false);
                  router.refresh();
                });
              }}
            >
              {pending ? "Saving…" : "Save view"}
            </Button>
          ) : null
        }
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 border-b border-black/5 pb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-[#3D421F]">
              <input
                type="checkbox"
                checked={allFieldsSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = someFieldsSelected && !allFieldsSelected;
                  }
                }}
                onChange={() => {
                  setVisibleIds(allFieldsSelected ? [] : allFieldIds);
                }}
              />
              {allFieldsSelected ? "Unselect all" : "Select all"}
            </label>
            {someFieldsSelected && !allFieldsSelected ? (
              <button
                type="button"
                className="text-xs font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
                onClick={() => setVisibleIds([])}
              >
                Unselect all
              </button>
            ) : null}
          </div>
          {fieldBlocks(blocks).map((block) => (
            <label
              key={block.id}
              className="flex items-center gap-2 text-sm text-[#3D421F]"
            >
              <input
                type="checkbox"
                checked={visibleIds.includes(block.id)}
                onChange={(event) => {
                  setVisibleIds((current) =>
                    event.target.checked
                      ? [...current, block.id]
                      : current.filter((id) => id !== block.id),
                  );
                }}
              />
              {block.field_label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Sort by</Label>
            <select
              className={selectClass}
              value={sortFieldId}
              onChange={(event) => setSortFieldId(event.target.value)}
            >
              <option value="submitted_at">Submitted date</option>
              <option value="category">Category</option>
              <option value="status">Status</option>
              {fieldBlocks(blocks).map((block) => (
                <option key={block.id} value={block.id}>
                  {block.field_label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <select
              className={selectClass}
              value={sortDirection}
              onChange={(event) =>
                setSortDirection(event.target.value as "asc" | "desc")
              }
            >
              <option value="desc">Newest / Z–A</option>
              <option value="asc">Oldest / A–Z</option>
            </select>
          </div>
        </div>
      </HiringDialog>

      <HiringDialog
        open={notifyOpen}
        title="New application notifications"
        description="Choose who is notified in the web app and mobile app when someone submits each form."
        onClose={() => setNotifyOpen(false)}
        busy={pending}
        wide
        footer={
          canEdit ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await saveHiringFormNotifications(
                    forms.map((form) => ({
                      formId: form.id,
                      userIds: notifyByForm[form.id] ?? [],
                    })),
                  );
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.saved("Notifications saved.");
                  setNotifyOpen(false);
                  router.refresh();
                });
              }}
            >
              {pending ? "Saving…" : "Save notifications"}
            </Button>
          ) : null
        }
      >
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a hiring form first, then choose who should be notified.
          </p>
        ) : notifyCandidates.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
            No users with Hiring access were found for this venue. Grant Hiring
            under Settings → Users first.
          </p>
        ) : (
          <div className="space-y-4">
            {forms.map((form) => {
              const selected = notifyByForm[form.id] ?? [];
              return (
                <div key={form.id} className="space-y-1.5">
                  <Label htmlFor={`notify-${form.id}`}>{form.name}</Label>
                  <SearchableMultiSelect
                    id={`notify-${form.id}`}
                    values={selected}
                    onChange={(next) =>
                      setNotifyByForm((current) => ({
                        ...current,
                        [form.id]: next,
                      }))
                    }
                    options={notifyOptions}
                    placeholder="Select people…"
                    searchPlaceholder="Search people…"
                    disabled={!canEdit || pending}
                    aria-label={`Notify for ${form.name}`}
                  />
                  <p className="text-xs text-black/45">
                    {selected.length === 0
                      ? "Nobody is notified for this form."
                      : `${selected.length} ${
                          selected.length === 1 ? "person" : "people"
                        } will be notified.`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </HiringDialog>

      <HiringDialog
        open={Boolean(detail)}
        title={detail?.applicant_name || "Application"}
        description={detail?.applicant_email || "No email on this reply"}
        onClose={() => {
          setDetail(null);
          setInterviewKind(null);
        }}
        busy={pending}
        wide
      >
        {detail ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {fieldBlocks(blocks).map((block) => {
                const files = detail.files.filter(
                  (file) => file.block_id === block.id,
                );
                const display = hiringAnswerDisplay(detail, block);
                return (
                  <div key={block.id} className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-black/40">
                      {block.field_label}
                    </p>
                    {block.field_type === "picture" && files[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={files[0].public_url}
                        alt=""
                        className="h-24 w-24 rounded-xl object-cover"
                      />
                    ) : files.length ? (
                      <ul className="space-y-1">
                        {files.map((file) => (
                          <li key={file.id}>
                            <a
                              href={file.public_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-[var(--venue-primary,#818a40)] underline"
                            >
                              {file.file_name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[#3D421F]">{display || "—"}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select
                  className={selectClass}
                  value={detail.category ?? ""}
                  disabled={!canEdit || pending}
                  onChange={(event) => {
                    const category = (event.target.value || null) as
                      | HiringCategory
                      | null;
                    startTransition(async () => {
                      const result = await updateHiringApplicationMeta({
                        applicationId: detail.id,
                        category,
                      });
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      setDetail({ ...detail, category });
                      router.refresh();
                    });
                  }}
                >
                  <option value="">Not set</option>
                  {HIRING_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {HIRING_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  className={selectClass}
                  value={detail.status}
                  disabled={!canEdit || pending}
                  onChange={(event) => {
                    const status = event.target
                      .value as HiringApplicationStatus;
                    startTransition(async () => {
                      const result = await updateHiringApplicationMeta({
                        applicationId: detail.id,
                        status,
                      });
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      setDetail({ ...detail, status });
                      router.refresh();
                    });
                  }}
                >
                  {HIRING_APPLICATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {HIRING_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {canEdit ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 w-full sm:h-10 sm:w-auto"
                  onClick={() => openInterview("request")}
                >
                  Request interview availability
                </Button>
                <Button
                  type="button"
                  className="h-11 w-full sm:h-10 sm:w-auto"
                  onClick={() => openInterview("confirm")}
                >
                  Confirm interview
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </HiringDialog>

      <HiringDialog
        open={Boolean(interviewKind && detail)}
        title={
          interviewKind === "confirm"
            ? "Confirm interview"
            : "Request availability"
        }
        onClose={() => setInterviewKind(null)}
        busy={pending}
        footer={
          <Button
            type="button"
            disabled={pending || !detail}
            onClick={() => {
              if (!detail || !interviewKind) return;
              startTransition(async () => {
                const result = await sendHiringInterviewEmail({
                  applicationId: detail.id,
                  kind: interviewKind,
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
                toast.saved(
                  interviewKind === "confirm"
                    ? "Interview confirmed and added to the calendar."
                    : "Interview request sent.",
                );
                setInterviewKind(null);
                setDetail(null);
                router.refresh();
              });
            }}
          >
            {pending ? "Sending…" : "Send email"}
          </Button>
        }
      >
        {interviewKind === "confirm" ? (
          <>
            <div className="space-y-1.5">
              <Label>Interview format</Label>
              <select
                className={selectClass}
                value={format}
                onChange={(event) => {
                  const next = event.target.value as "in_person" | "video";
                  setFormat(next);
                  if (selectedForm) {
                    const copy = hiringInterviewConfirmCopy(selectedForm, next);
                    setSubject(copy.subject);
                    setBody(copy.body);
                  }
                }}
              >
                <option value="in_person">In person</option>
                <option value="video">Video call</option>
              </select>
            </div>
            {format === "in_person" ? (
              <div className="space-y-1.5">
                <Label>Location details</Label>
                <Textarea
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  rows={2}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Meeting link</Label>
                <Input
                  value={meetingLink}
                  onChange={(event) => setMeetingLink(event.target.value)}
                />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <DateInput value={date} onChange={setDate} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interview-time">Time</Label>
                <Input
                  id="interview-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={7}
          />
        </div>
      </HiringDialog>
    </div>
  );
}

/** Phone-style candidate thumbnail: photo, short name, position, nationality. */
function CandidateThumbnail({
  application,
  blocks,
  onOpen,
}: {
  application: HiringApplication;
  blocks: HiringFormBlock[];
  onOpen: () => void;
}) {
  const photo = hiringPictureUrl(application, blocks);
  const name = hiringShortName(application.applicant_name || "Unnamed");
  const answerFor = (matches: (block: HiringFormBlock) => boolean) => {
    for (const block of blocks.filter(matches)) {
      const text = hiringAnswerDisplay(application, block).trim();
      if (text && text !== "—") return text;
    }
    return "";
  };
  const position = answerFor((block) => /position/i.test(block.field_label ?? ""));
  const nationality = nationalityDisplay(
    answerFor(
      (block) => block.field_type === "nationality" || /nationality/i.test(block.field_label ?? ""),
    ),
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${name}`}
      className="block w-full min-w-0 rounded-2xl border border-black/10 bg-white/80 p-1.5 text-left transition hover:shadow-sm active:scale-[0.98]"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="aspect-square w-full rounded-xl object-cover" />
      ) : (
        <span className="flex aspect-square w-full items-center justify-center rounded-xl bg-[var(--venue-primary,#818a40)]/15 text-2xl font-medium text-[#3D421F]">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="mt-1.5 block truncate px-0.5 text-center text-xs font-medium leading-4 text-[#3D421F]">
        {name}
      </span>
      <span className="block truncate px-0.5 text-center text-[11px] leading-4 text-black/55">
        {position || "Position not provided"}
      </span>
      <span className="block truncate px-0.5 pb-0.5 text-center text-[11px] leading-4 text-black/50">
        {nationality
          ? [nationality.label, nationality.flag].filter(Boolean).join(" ")
          : "Nationality not provided"}
      </span>
    </button>
  );
}
