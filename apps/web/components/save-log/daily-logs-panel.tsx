"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  deleteSaveLogRecord,
  uploadSaveLogRecord,
} from "@/lib/actions/save-log";
import {
  formatFileSize,
  isImageContentType,
  todayIsoDate,
  type SaveLogRecord,
  type SaveLogType,
} from "@/lib/save-log/types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { cn } from "@/lib/utils";

type DailyLogsPanelProps = {
  types: SaveLogType[];
  records: SaveLogRecord[];
  datesWithEntries: string[];
  canEdit: boolean;
};

export function DailyLogsPanel({
  types,
  records,
  datesWithEntries,
  canEdit,
}: DailyLogsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { scope, slug } = useVenueScope();
  const today = todayIsoDate();
  const selectedDate = searchParams.get("date") ?? today;
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<SaveLogRecord | null>(null);
  const datesWithEntriesSet = useMemo(
    () => new Set(datesWithEntries),
    [datesWithEntries],
  );

  const recordsByType = useMemo(() => {
    const map = new Map<string, SaveLogRecord[]>();
    for (const record of records) {
      const list = map.get(record.type_id) ?? [];
      list.push(record);
      map.set(record.type_id, list);
    }
    return map;
  }, [records]);

  const required = types.filter((type) => type.required_daily);
  const loggedRequired = required.filter(
    (type) => (recordsByType.get(type.id) ?? []).length > 0,
  ).length;

  function goToDate(isoDate: string) {
    const href = toScopedHref(
      `/save-log/logs?date=${isoDate}`,
      scope,
      slug,
    );
    startTransition(() => router.push(href));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[11.5rem]">
            <label
              htmlFor="save-log-date"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-black/45"
            >
              Log date
            </label>
            <DateInput
              id="save-log-date"
              value={selectedDate}
              onChange={goToDate}
              maxDate={today}
              datesWithEntries={datesWithEntriesSet}
              inputClassName="h-10"
              className="w-full"
            />
          </div>
          {selectedDate !== today ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => goToDate(today)}
            >
              Today
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-black/55">
          {required.length === 0
            ? "No required log types yet"
            : `${loggedRequired} of ${required.length} required logs uploaded for ${formatDisplayDate(selectedDate)}`}
        </p>
      </div>

      {types.length === 0 ? (
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">No log types yet</h2>
          <p className="mt-2 text-sm text-black/60">
            Add HACCP log types in SafeLog Settings, then come back to upload
            the daily records.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {types.map((type) => (
            <LogTypeCard
              key={type.id}
              type={type}
              records={recordsByType.get(type.id) ?? []}
              logDate={selectedDate}
              canEdit={canEdit}
              busy={pending}
              onPreview={setPreview}
            />
          ))}
        </div>
      )}

      {preview ? (
        <FilePreview record={preview} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
}

function LogTypeCard({
  type,
  records,
  logDate,
  canEdit,
  busy,
  onPreview,
}: {
  type: SaveLogType;
  records: SaveLogRecord[];
  logDate: string;
  canEdit: boolean;
  busy: boolean;
  onPreview: (record: SaveLogRecord) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const complete = records.length > 0;

  async function uploadFiles(files: FileList | File[]) {
    if (!canEdit || uploading) return;
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    try {
      for (const file of list) {
        const formData = new FormData();
        formData.set("typeId", type.id);
        formData.set("logDate", logDate);
        formData.set("file", file);
        const result = await uploadSaveLogRecord(formData);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }
      toast.uploaded(
        list.length === 1 ? "Log uploaded." : `${list.length} logs uploaded.`,
      );
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function remove(record: SaveLogRecord) {
    if (!canEdit) return;
    if (!window.confirm(`Remove ${record.original_name}?`)) return;
    const formData = new FormData();
    formData.set("recordId", record.id);
    const result = await deleteSaveLogRecord(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.saved("Log removed.");
    router.refresh();
  }

  return (
    <Card
      className={cn(
        "flex flex-col p-4",
        complete && "border-[var(--venue-primary,#818a40)]/25",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">{type.label}</h2>
          {type.description ? (
            <p className="mt-0.5 text-sm text-black/50">{type.description}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
            complete
              ? "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/12 text-[var(--venue-primary,#818a40)]"
              : type.required_daily
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-black/10 bg-white/70 text-black/45",
          )}
        >
          {complete ? "Logged" : type.required_daily ? "Required" : "Optional"}
        </span>
      </div>

      {records.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {records.map((record) => (
            <li
              key={record.id}
              className="flex items-center gap-3 rounded-lg border border-black/8 bg-white/70 p-2"
            >
              <button
                type="button"
                onClick={() =>
                  isImageContentType(record.content_type)
                    ? onPreview(record)
                    : window.open(record.file_url, "_blank", "noopener,noreferrer")
                }
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                {isImageContentType(record.content_type) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={record.file_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-black/5 text-[#3D421F]">
                    <FileText className="h-5 w-5" aria-hidden />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#3D421F]">
                    {record.original_name}
                  </span>
                  <span className="block text-xs text-black/45">
                    {[
                      formatFileSize(record.file_size),
                      record.uploaded_by_name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void remove(record)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Remove ${record.original_name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-black/45">No file uploaded for this date.</p>
      )}

      {canEdit ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void uploadFiles(event.dataTransfer.files);
          }}
          className={cn(
            "mt-4 rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
            dragging
              ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)]/10"
              : "border-black/15 bg-white/40",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="sr-only"
            disabled={busy || uploading}
            onChange={(event) => {
              const files = event.target.files;
              if (files) void uploadFiles(files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#3D421F]"
          >
            {uploading ? (
              "Uploading…"
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden />
                Drop photos or PDFs, or click to upload
              </>
            )}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function FilePreview({
  record,
  onClose,
}: {
  record: SaveLogRecord;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#3D421F]"
        aria-label="Close preview"
      >
        <X className="h-4 w-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={record.file_url}
        alt={record.original_name}
        className="max-h-[90vh] max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
