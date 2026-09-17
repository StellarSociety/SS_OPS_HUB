"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CalendarOff, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { MobileLeaveBalancesPanel } from "@/components/mobile/mobile-leave-balances";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/components/ui/toast";
import {
  cancelEmployeeLeaveRequest,
  loadMobileLeavePageAction,
  submitEmployeeLeaveRequest,
} from "@/lib/actions/hr-leave-requests";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  countInclusiveDays,
  employeeCanDeleteLeaveRequest,
  employeeCanEditLeaveRequest,
  leaveCalendarStatusLabel,
  leaveRequestSourceLabel,
  type LeaveRequestListItem,
  type LeaveRequestTypeOption,
} from "@/lib/hr/leave";
import type { MobileLeavePage } from "@/lib/mobile/employee-leave";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { useMobileInAppBack } from "@/components/mobile/use-mobile-in-app-back";

type MobileEmployeeLeaveScreenProps = {
  venue: Venue;
  initial: MobileLeavePage;
  previewStaffId?: string | null;
  employeeName?: string | null;
  onSelectTab?: (tab: MobileTabItem) => void;
};

function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

function formatRange(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return formatDisplayDate(fromDate);
  return `${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}`;
}

function statusChipClass(status: LeaveRequestListItem["displayStatus"]): string {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100";
    case "rejected":
      return "bg-rose-50 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200";
    case "cancelled":
      return "bg-black/[0.06] text-black/50 dark:bg-white/10 dark:text-white/50";
    default:
      return "bg-sky-50 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100";
  }
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function DetailTag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-[#3D421F] dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText]",
        className,
      )}
    >
      {children}
    </span>
  );
}

function emptyForm(types: LeaveRequestTypeOption[]): LeaveFormState {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    requestId: null,
    leaveTypeId: types[0]?.id ?? "",
    fromDate: iso,
    toDate: iso,
    reason: "",
  };
}

type LeaveFormState = {
  requestId: string | null;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason: string;
};

function formFromRequest(item: LeaveRequestListItem): LeaveFormState {
  return {
    requestId: item.id,
    leaveTypeId: item.leaveTypeId,
    fromDate: item.fromDate,
    toDate: item.toDate,
    reason: item.employeeNotes || item.reason || "",
  };
}

export function MobileEmployeeLeaveScreen({
  venue,
  initial,
  previewStaffId = null,
  employeeName = null,
  onSelectTab,
}: MobileEmployeeLeaveScreenProps) {
  const [page, setPage] = useState(initial);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LeaveFormState>(() => emptyForm(initial.leaveTypes));
  const [openItem, setOpenItem] = useState<LeaveRequestListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstName = firstNameOf(employeeName);
  const linked = page.linked && Boolean(page.staffId);
  const canEditOpen = openItem
    ? employeeCanEditLeaveRequest({
        status: openItem.status,
        source: openItem.source,
      })
    : true;
  const canDelete = openItem
    ? employeeCanDeleteLeaveRequest(openItem.status)
    : false;
  const readOnly = Boolean(openItem) && !canEditOpen;

  const selectedType = useMemo(
    () => page.leaveTypes.find((t) => t.id === form.leaveTypeId) ?? page.leaveTypes[0],
    [form.leaveTypeId, page.leaveTypes],
  );
  const days =
    form.fromDate && form.toDate
      ? countInclusiveDays(form.fromDate, form.toDate)
      : 0;

  useEffect(() => {
    setPage(initial);
  }, [initial]);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) closeForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen, pending]);

  function closeForm() {
    setFormOpen(false);
    setOpenItem(null);
    setError(null);
  }

  const backRef = useMobileInAppBack<HTMLDivElement>(closeForm, formOpen);

  function openApply() {
    setForm(emptyForm(page.leaveTypes));
    setOpenItem(null);
    setError(null);
    setFormOpen(true);
  }

  function openRequest(item: LeaveRequestListItem) {
    setForm(formFromRequest(item));
    setOpenItem(item);
    setError(null);
    setFormOpen(true);
  }

  function submit() {
    if (!form.leaveTypeId || !form.fromDate || !form.toDate) {
      setError("Choose a leave type and dates.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitEmployeeLeaveRequest({
        venueId: venue.id,
        staffId: previewStaffId,
        leaveTypeId: form.leaveTypeId,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason,
        requestId: form.requestId,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.saved(form.requestId ? "Leave request updated." : "Leave request sent.");
      closeForm();
      const next = await loadMobileLeavePageAction({
        venueId: venue.id,
        staffId: previewStaffId,
      });
      setPage(next);
    });
  }

  function cancelRequest() {
    if (!form.requestId) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelEmployeeLeaveRequest({
        venueId: venue.id,
        staffId: previewStaffId,
        requestId: form.requestId!,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.saved("Leave request deleted.");
      closeForm();
      const next = await loadMobileLeavePageAction({
        venueId: venue.id,
        staffId: previewStaffId,
      });
      setPage(next);
    });
  }

  return (
    <div
      ref={backRef}
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 pt-4",
          formOpen ? "pb-8" : "pb-32",
        )}
      >
        <div className="relative flex items-center justify-center gap-3">
          <h1
            id="mobile-leave-form-title"
            className="min-w-0 flex-1 text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]"
          >
            {formOpen
              ? form.requestId
                ? readOnly
                  ? "Leave details"
                  : "Edit leave"
                : "Apply for leave"
              : firstName
                ? `${firstName} Leave`
                : "Leave"}
          </h1>
          {formOpen ? (
            <button
              type="button"
              onClick={closeForm}
              disabled={pending}
              className="absolute right-4 rounded-md p-1.5 text-black/45 transition hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50 dark:text-white/50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        {!linked ? (
          <div className="mt-10 flex flex-col items-center gap-2 px-6 text-center">
            <CalendarOff className="h-8 w-8 text-[#3D421F]/30 dark:text-white/30" />
            <p className="text-sm text-black/50 dark:text-white/50">
              Your login isn’t linked to a staff record yet. Ask HR to connect
              your profile.
            </p>
          </div>
        ) : formOpen ? (
          <div className="mt-4 space-y-4" role="form">
            <div className="space-y-1.5">
              <label
                htmlFor="mobile-leave-type"
                className="text-sm font-medium text-[#3D421F] dark:text-[CanvasText]"
              >
                Leave type
              </label>
              <select
                id="mobile-leave-type"
                value={form.leaveTypeId}
                disabled={pending || readOnly}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    leaveTypeId: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-md border border-black/10 bg-white px-3 text-[16px] text-[#3D421F] outline-none disabled:opacity-60 dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText]"
              >
                {page.leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-[#3D421F] dark:text-[CanvasText]">
                  From
                </p>
                <DateInput
                  value={form.fromDate}
                  onChange={(fromDate) =>
                    setForm((current) => ({
                      ...current,
                      fromDate,
                      toDate:
                        current.toDate && fromDate && current.toDate < fromDate
                          ? fromDate
                          : current.toDate,
                    }))
                  }
                  disabled={pending || readOnly}
                  className="w-full"
                  inputClassName="h-11"
                  aria-label="From date"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-[#3D421F] dark:text-[CanvasText]">
                  To
                </p>
                <DateInput
                  value={form.toDate}
                  onChange={(toDate) =>
                    setForm((current) => ({ ...current, toDate }))
                  }
                  disabled={pending || readOnly}
                  className="w-full"
                  inputClassName="h-11"
                  aria-label="To date"
                />
              </div>
            </div>

            <p className="text-xs text-black/45 dark:text-white/45">
              {days} calendar {days === 1 ? "day" : "days"}
              {selectedType ? ` · ${selectedType.name}` : ""}
            </p>

            {openItem ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-medium",
                      statusChipClass(openItem.displayStatus),
                    )}
                  >
                    {leaveCalendarStatusLabel(openItem.displayStatus)}
                  </span>
                  {openItem.detailsLocked ? (
                    <DetailTag>Locked</DetailTag>
                  ) : null}
                  {openItem.onSchedule ? (
                    <DetailTag>On schedule</DetailTag>
                  ) : null}
                  <DetailTag>{leaveRequestSourceLabel(openItem.source)}</DetailTag>
                  {openItem.requestNumber ? (
                    <DetailTag className="font-mono">
                      {openItem.requestNumber}
                    </DetailTag>
                  ) : null}
                </div>
                {openItem.displayStatus === "approved" ? (
                  <p className="text-xs text-black/45 dark:text-white/45">
                    Approved
                    {openItem.approvedByName
                      ? ` by ${openItem.approvedByName}`
                      : ""}
                    {formatWhen(openItem.approvedAt)
                      ? ` · ${formatWhen(openItem.approvedAt)}`
                      : ""}
                  </p>
                ) : openItem.displayStatus === "rejected" ? (
                  <p className="text-xs text-black/45 dark:text-white/45">
                    Rejected
                    {openItem.rejectedByName
                      ? ` by ${openItem.rejectedByName}`
                      : ""}
                    {formatWhen(openItem.rejectedAt)
                      ? ` · ${formatWhen(openItem.rejectedAt)}`
                      : ""}
                  </p>
                ) : canEditOpen ? (
                  <p className="text-xs text-black/45 dark:text-white/45">
                    Waiting for HR. You can edit and save this until it is
                    approved or rejected.
                  </p>
                ) : openItem.displayStatus === "pending" ? (
                  <p className="text-xs text-black/45 dark:text-white/45">
                    Waiting for HR approval.
                  </p>
                ) : null}
                {openItem.hrNotes ? (
                  <p className="text-xs text-black/45 dark:text-white/45">
                    HR notes: {openItem.hrNotes}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor="mobile-leave-reason"
                className="text-sm font-medium text-[#3D421F] dark:text-[CanvasText]"
              >
                Reason
              </label>
              <textarea
                id="mobile-leave-reason"
                value={form.reason}
                disabled={pending || readOnly}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Optional notes for HR"
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-[16px] text-[#3D421F] outline-none placeholder:text-black/35 disabled:opacity-60 dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText]"
              />
            </div>

            {error ? (
              <p className="text-sm text-red-700 dark:text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            {readOnly ? (
              <div className="space-y-2">
                {canDelete ? (
                  <button
                    type="button"
                    onClick={cancelRequest}
                    disabled={pending}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-800 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {pending ? "Deleting…" : "Delete request"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={pending}
                  className="flex h-12 w-full items-center justify-center rounded-xl border border-black/10 bg-white text-sm font-semibold text-[#3D421F] disabled:opacity-50 dark:border-white/12 dark:bg-white/10 dark:text-[CanvasText]"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || !form.leaveTypeId || days < 1}
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--venue-primary,#818a40)] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {pending
                    ? "Sending…"
                    : form.requestId
                      ? "Save request"
                      : "Send request"}
                </button>
                {form.requestId && canDelete ? (
                  <button
                    type="button"
                    onClick={cancelRequest}
                    disabled={pending}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-medium text-rose-800 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {pending ? "Deleting…" : "Delete request"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {page.balances.primary.length > 0 ? (
              <MobileLeaveBalancesPanel balances={page.balances} />
            ) : null}

            <button
              type="button"
              onClick={openApply}
              disabled={pending || page.leaveTypes.length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--venue-primary,#818a40)] text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Apply for leave
            </button>

            <section>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-lg text-[#3D421F] dark:text-[CanvasText]">
                  Your leave
                </h2>
                <p className="text-xs text-black/40 dark:text-white/40">
                  {page.requests.length}{" "}
                  {page.requests.length === 1 ? "request" : "requests"}
                </p>
              </div>

              {page.requests.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-black/15 bg-black/[0.03] px-4 py-8 text-center dark:border-white/12 dark:bg-white/[0.06]">
                  <p className="text-sm text-black/55 dark:text-white/55">
                    No leave applied yet.
                  </p>
                  <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                    Apply for leave and HR will review it on Leave Requests.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {page.requests.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openRequest(item)}
                        className="flex w-full items-start gap-3 rounded-xl border border-black/10 bg-black/[0.03] px-3.5 py-3 text-left transition hover:bg-black/[0.05] dark:border-white/12 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                      >
                        <span
                          className="mt-0.5 inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded-md border px-2 py-1 font-mono text-[11px] font-medium"
                          style={{
                            backgroundColor:
                              selectedStyle(page.leaveTypes, item)?.bgColor,
                            color: selectedStyle(page.leaveTypes, item)?.textColor,
                            borderColor:
                              selectedStyle(page.leaveTypes, item)?.borderColor,
                          }}
                        >
                          {item.labelCode}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-[#3D421F] dark:text-[CanvasText]">
                              {item.leaveTypeName}
                            </p>
                            <span
                              className={cn(
                                "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
                                statusChipClass(item.displayStatus),
                              )}
                            >
                              {leaveCalendarStatusLabel(item.displayStatus)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-black/55 dark:text-white/55">
                            {formatRange(item.fromDate, item.toDate)}
                            {" · "}
                            {item.days} {item.days === 1 ? "day" : "days"}
                          </p>
                          {item.reason ? (
                            <p className="mt-1 line-clamp-2 text-xs text-black/45 dark:text-white/45">
                              {item.reason}
                            </p>
                          ) : null}
                          <p className="mt-1 font-mono text-[10px] text-black/35 dark:text-white/35">
                            {item.requestNumber}
                            {employeeCanEditLeaveRequest({
                              status: item.status,
                              source: item.source,
                            })
                              ? " · Tap to edit"
                              : employeeCanDeleteLeaveRequest(item.status)
                                ? " · Tap to delete"
                                : ""}
                            {item.detailsLocked ? " · Locked" : ""}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-black/25 dark:text-white/30" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      {formOpen ? null : (
        <MobileTabBar
          app="profile"
          activeId="leave"
          venueSlug={venue.slug}
          onSelectTab={onSelectTab}
        />
      )}
    </div>
  );
}

function selectedStyle(
  types: LeaveRequestTypeOption[],
  item: LeaveRequestListItem,
) {
  return types.find((t) => t.id === item.leaveTypeId) ?? types.find((t) => t.labelCode === item.labelCode);
}
