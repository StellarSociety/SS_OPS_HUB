"use client";

import { useConnectCanWrite } from "@/components/connect/connect-write-context";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, Paperclip, PartyPopper, X } from "lucide-react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { useScopedHref } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { encodeTypedMentions } from "@/components/connect/mention-people";
import { MentionTextarea } from "@/components/connect/mention-textarea";
import { createConnectPost } from "@/lib/actions/connect";
import { celebrationHeadline, formatFileSize } from "@/lib/connect/format";
import {
  CONNECT_MAX_ATTACHMENTS,
  CONNECT_MAX_FILE_BYTES,
  type ConnectCelebrationKind,
  type ConnectPerson,
} from "@/lib/connect/types";
import { cn } from "@/lib/utils";

export type ComposerGroup = { id: string; name: string; color: string };

export type ComposerCelebration = {
  staffId: string;
  staffName: string;
  kind: ConnectCelebrationKind;
  years: number | null;
};

type Draft = { file: File; previewUrl: string | null };

const attachClass =
  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-black/65 hover:bg-black/5";
const attachCompactClass = "h-8 gap-1.5 rounded-full px-2.5 py-0 text-[13px]";

/** Hidden for Connecteam read-only (phone Viewer). */
export function PostComposer(props: Parameters<typeof PostComposerInner>[0]) {
  const canWrite = useConnectCanWrite();
  return canWrite ? <PostComposerInner {...props} /> : null;
}

function PostComposerInner({
  me,
  groups,
  defaultGroupId,
  celebration: initialCelebration,
  basePath,
  compact = false,
  showDestination = true,
}: {
  me: ConnectPerson | null;
  groups: ComposerGroup[];
  defaultGroupId?: string | null;
  celebration?: ComposerCelebration | null;
  /** Canonical path to return to once a celebration post is published. */
  basePath: string;
  /** Phone layout: tighter card, smaller controls, actions kept on one line. */
  compact?: boolean;
  /** Hide "Posting to …" when the screen title already names the group. */
  showDestination?: boolean;
}) {
  const router = useRouter();
  const scopedBase = useScopedHref(basePath);
  const [pending, startTransition] = useTransition();
  const [celebration, setCelebration] = useState(initialCelebration ?? null);
  const [expanded, setExpanded] = useState(Boolean(initialCelebration));
  const [body, setBody] = useState("");
  const [groupId, setGroupId] = useState(
    defaultGroupId && groups.some((g) => g.id === defaultGroupId)
      ? defaultGroupId
      : (groups[0]?.id ?? ""),
  );
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // A new "Congrats" link swaps the celebration preset without a remount.
  const [syncedCelebration, setSyncedCelebration] = useState(initialCelebration);
  if (syncedCelebration?.staffId !== initialCelebration?.staffId) {
    setSyncedCelebration(initialCelebration);
    setCelebration(initialCelebration ?? null);
    if (initialCelebration) setExpanded(true);
  }

  const celebrateStaffId = initialCelebration?.staffId ?? null;
  useEffect(() => {
    if (celebrateStaffId) textRef.current?.focus();
  }, [celebrateStaffId]);

  useEffect(
    () => () => {
      for (const d of drafts) if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    },
    // Revoke only on unmount; removals revoke individually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId],
  );

  if (groups.length === 0) return null;

  const firstName = me?.name.split(/\s+/)[0] ?? "there";

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.filter((f) => f.size > CONNECT_MAX_FILE_BYTES);
    if (tooBig.length) toast.alert(`${tooBig[0]!.name} is over 25 MB and was skipped.`);
    const accepted = incoming.filter((f) => f.size <= CONNECT_MAX_FILE_BYTES);
    setDrafts((prev) => {
      const room = CONNECT_MAX_ATTACHMENTS - prev.length;
      if (accepted.length > room) {
        toast.alert(`Up to ${CONNECT_MAX_ATTACHMENTS} attachments per post.`);
      }
      return [
        ...prev,
        ...accepted.slice(0, Math.max(0, room)).map((file) => ({
          file,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        })),
      ];
    });
    setExpanded(true);
  }

  function removeDraft(index: number) {
    setDrafts((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function reset() {
    for (const d of drafts) if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    setDrafts([]);
    setBody("");
    setExpanded(false);
    if (celebration) {
      setCelebration(null);
      router.replace(scopedBase, { scroll: false });
    }
  }

  function submit() {
    if (!groupId) {
      toast.alert("Choose a group to post in.");
      return;
    }
    if (!body.trim() && drafts.length === 0 && !celebration) {
      toast.alert("Write something or add a photo or file.");
      return;
    }
    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("body", encodeTypedMentions(body));
    for (const d of drafts) formData.append("files", d.file);
    if (celebration) {
      formData.set("celebrationStaffId", celebration.staffId);
      formData.set("celebrationKind", celebration.kind);
      if (celebration.years != null) formData.set("celebrationYears", String(celebration.years));
    }

    startTransition(async () => {
      const result = await createConnectPost(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(selectedGroup ? `Posted to ${selectedGroup.name}.` : "Posted.");
      reset();
      router.refresh();
    });
  }

  // Phone, while writing: Cancel joins the row, so attachments go icon-only
  // to keep everything on one line.
  const iconOnly = compact && expanded;

  return (
    <section className={cn("rounded-2xl border border-black/5 bg-white shadow-sm", compact ? "p-3" : "p-4")}>
      {celebration ? (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-gradient-to-r from-amber-50 to-rose-50 px-3 py-2.5 text-sm text-[#3D421F]">
          <span className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            {celebrationHeadline(celebration.kind, celebration.staffName, celebration.years)}
          </span>
          <button
            type="button"
            className="rounded-full p-0.5 text-black/40 hover:bg-black/5 hover:text-black/70"
            onClick={() => {
              setCelebration(null);
              router.replace(scopedBase, { scroll: false });
            }}
            aria-label="Remove celebration"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className={cn("flex items-start", compact ? "gap-2.5" : "gap-3")}>
        <ConnectAvatar name={me?.name ?? "You"} photoUrl={me?.photoUrl} size={compact ? "sm" : "md"} />
        <MentionTextarea
          ref={textRef}
          value={body}
          onValueChange={setBody}
          onFocus={() => setExpanded(true)}
          placeholder={
            celebration
              ? `Write a message for ${celebration.staffName.split(/\s+/)[0]}…`
              : `What's on your mind, ${firstName}?`
          }
          rows={expanded ? 4 : 1}
          maxLength={5000}
          className={cn(
            "flex-1 resize-none bg-[#F4F5EE] text-[15px] text-[#2B2F16] outline-none transition-[height] placeholder:text-black/40 focus:bg-white focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/30",
            compact ? "min-h-9 rounded-[18px] px-3.5 py-[7px] leading-[22px]" : "min-h-11 rounded-2xl px-4 py-2.5",
          )}
        />
      </div>

      {drafts.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {drafts.map((d, i) => (
            <li
              key={`${d.file.name}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-xl border border-black/5 bg-[#F4F5EE]"
            >
              {d.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
                  <FileText className="h-6 w-6 text-black/40" aria-hidden />
                  <span className="line-clamp-2 break-all text-[11px] text-black/60">
                    {d.file.name}
                  </span>
                  <span className="text-[10px] text-black/40">{formatFileSize(d.file.size)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeDraft(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-90 hover:bg-black/80"
                aria-label={`Remove ${d.file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className={cn(
          "flex items-center border-t border-black/5",
          compact ? "mt-2.5 flex-nowrap gap-1 pt-2.5" : "mt-3 flex-wrap gap-2 pt-3",
        )}
      >
        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          aria-label={iconOnly ? "Add photo" : undefined}
          className={cn(attachClass, compact && attachCompactClass, iconOnly && "w-8 justify-center px-0")}
        >
          <ImagePlus className={cn("text-emerald-600", compact ? "h-[18px] w-[18px]" : "h-5 w-5")} aria-hidden />
          {iconOnly ? null : "Photo"}
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={iconOnly ? "Add file" : undefined}
          className={cn(attachClass, compact && attachCompactClass, iconOnly && "w-8 justify-center px-0")}
        >
          <Paperclip className={cn("text-sky-600", compact ? "h-[18px] w-[18px]" : "h-5 w-5")} aria-hidden />
          {iconOnly ? null : "File"}
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className={cn("ml-auto flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}>
          {groups.length > 1 ? (
            <label className={cn("flex min-w-0 items-center gap-1.5 text-black/55", compact ? "text-[13px]" : "text-sm")}>
              {compact ? null : <span className="hidden sm:inline">Post to</span>}
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                aria-label="Post to"
                className={cn(
                  "min-w-0 rounded-lg border border-black/10 bg-white px-2 text-[#3D421F]",
                  compact ? "h-8 w-full max-w-[9rem] truncate rounded-full text-[13px]" : "h-9 text-sm",
                )}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          ) : showDestination ? (
            <span className={cn("min-w-0 truncate text-black/55", compact ? "text-[13px]" : "text-sm")}>
              Posting to {selectedGroup?.name}
            </span>
          ) : null}
          {expanded ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={reset}
              className={cn(compact && "h-8 shrink-0 px-2.5 text-[13px]")}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={submit}
            className={cn(compact && "h-8 shrink-0 rounded-full px-4 text-[13px] font-semibold")}
          >
            {pending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </section>
  );
}
