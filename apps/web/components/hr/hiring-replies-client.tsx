"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Settings2 } from "lucide-react";
import { HiringDialog } from "@/components/hr/hiring-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  saveHiringForm,
  sendHiringInterviewEmail,
  updateHiringApplicationMeta,
} from "@/lib/actions/hr-hiring";
import { hiringAnswerDisplay, hiringPictureUrl } from "@/lib/hr/hiring/display";
import {
  HIRING_CATEGORIES,
  HIRING_CATEGORY_LABELS,
  HIRING_STATUS_LABELS,
  HIRING_APPLICATION_STATUSES,
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

export function HiringRepliesClient({
  forms,
  selectedForm,
  blocks,
  applications,
  canEdit,
}: {
  forms: HiringForm[];
  selectedForm: HiringForm | null;
  blocks: HiringFormBlock[];
  applications: HiringApplication[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [viewOpen, setViewOpen] = useState(false);
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

  const columns = fieldBlocks(blocks).filter((block) =>
    visibleIds.includes(block.id),
  );

  const sorted = useMemo(() => {
    const copy = [...applications];
    copy.sort((a, b) => {
      let left = "";
      let right = "";
      if (sortFieldId === "submitted_at") {
        left = a.submitted_at;
        right = b.submitted_at;
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

  function openInterview(kind: "request" | "confirm") {
    if (!detail || !selectedForm) return;
    setInterviewKind(kind);
    if (kind === "request") {
      setSubject(selectedForm.interview_request_subject);
      setBody(selectedForm.interview_request_body);
    } else {
      setSubject(selectedForm.interview_confirm_subject);
      setBody(selectedForm.interview_confirm_body);
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
                ),
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
      </div>

      {!selectedForm ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          Choose a form to see its replies.
        </Card>
      ) : sorted.length === 0 ? (
        <Card className="px-6 py-16 text-center text-sm text-muted-foreground">
          No replies yet. Share the form link from Forms Builder.
        </Card>
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
                <th className="px-3 py-2 font-medium">Submitted</th>
                {columns.map((column) => (
                  <th key={column.id} className="px-3 py-2 font-medium">
                    {column.field_label}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Status</th>
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
                    sort_field_id:
                      sortFieldId === "submitted_at" ? null : sortFieldId,
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
                onChange={(event) =>
                  setFormat(event.target.value as "in_person" | "video")
                }
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
