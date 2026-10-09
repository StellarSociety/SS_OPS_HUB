"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  SendHorizontal,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "@/components/ui/toast";
import {
  addConnectComment,
  deleteConnectComment,
  deleteConnectPost,
  setConnectPostReaction,
  toggleConnectCommentLike,
  toggleConnectPostPin,
  updateConnectPost,
} from "@/lib/actions/connect";
import {
  celebrationHeadline,
  formatFileSize,
  formatPostTime,
  formatPostTimestamp,
  isImageAttachment,
} from "@/lib/connect/format";
import {
  CONNECT_REACTION_EMOJI,
  CONNECT_REACTION_LABELS,
  CONNECT_REACTIONS,
  type ConnectAttachment,
  type ConnectComment,
  type ConnectPerson,
  type ConnectPost,
  type ConnectReaction,
} from "@/lib/connect/types";
import { cn } from "@/lib/utils";

const COLLAPSE_AT = 420;
const COMMENTS_PREVIEW = 2;

export function PostCard({
  post,
  me,
  showGroup,
}: {
  post: ConnectPost;
  me: ConnectPerson | null;
  showGroup: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showComments, setShowComments] = useState(post.comments.length > 0);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Optimistic reaction state; server truth arrives with router.refresh().
  const [myReaction, setMyReaction] = useState(post.myReaction);
  const [counts, setCounts] = useState(post.reactionCounts);
  const [syncedCounts, setSyncedCounts] = useState(post.reactionCounts);
  if (syncedCounts !== post.reactionCounts) {
    setSyncedCounts(post.reactionCounts);
    setMyReaction(post.myReaction);
    setCounts(post.reactionCounts);
  }

  const reactionTotal = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const topReactions = (Object.entries(counts) as [ConnectReaction, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([r]) => r);

  function react(next: ConnectReaction | null) {
    const prev = myReaction;
    setMyReaction(next);
    setCounts((c) => {
      const copy = { ...c };
      if (prev) copy[prev] = Math.max(0, (copy[prev] ?? 1) - 1);
      if (next) copy[next] = (copy[next] ?? 0) + 1;
      return copy;
    });
    startTransition(async () => {
      const result = await setConnectPostReaction(post.id, next);
      if (!result.ok) {
        toast.error(result.error);
        setMyReaction(prev);
        setCounts(post.reactionCounts);
        return;
      }
      router.refresh();
    });
  }

  function runPin() {
    startTransition(async () => {
      const result = await toggleConnectPostPin(post.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.pinned ? "Post pinned to the top of the group." : "Post unpinned.");
      router.refresh();
    });
  }

  function runDelete() {
    startTransition(async () => {
      const result = await deleteConnectPost(post.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirmDelete(false);
      toast.saved("Post removed.");
      router.refresh();
    });
  }

  const author = post.author;

  return (
    <article
      id={`post-${post.id}`}
      className="scroll-mt-20 rounded-2xl border border-black/5 bg-white shadow-sm target:ring-2 target:ring-[var(--venue-primary,#818a40)]/40"
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <ConnectAvatar name={author?.name ?? "Former user"} photoUrl={author?.photoUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] leading-tight">
            <span className="font-semibold text-[#2B2F16]">{author?.name ?? "Former user"}</span>
            {showGroup ? (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-black/35" aria-hidden />
                <ScopedLink
                  href={`/connect/groups/${post.groupId}`}
                  className="font-semibold hover:underline"
                  style={{ color: post.groupColor }}
                >
                  {post.groupName}
                </ScopedLink>
              </>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-black/50">
            {author?.positionName ? <span>{author.positionName} ·</span> : null}
            <time
              dateTime={post.createdAt}
              title={formatPostTimestamp(post.createdAt)}
              suppressHydrationWarning
            >
              {formatPostTime(post.createdAt)}
            </time>
            {post.editedAt ? <span>· Edited</span> : null}
            {post.pinnedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                <Pin className="h-3 w-3" aria-hidden />
                Pinned
              </span>
            ) : null}
          </p>
        </div>
        {post.canEdit || post.canPin || post.canDelete ? (
          <PostMenu
            canEdit={post.canEdit}
            canPin={post.canPin}
            canDelete={post.canDelete}
            pinned={Boolean(post.pinnedAt)}
            onEdit={() => setEditing(true)}
            onPin={runPin}
            onDelete={() => setConfirmDelete(true)}
          />
        ) : null}
      </header>

      {post.celebration ? (
        <div className="mx-4 mt-3 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-amber-100 via-rose-100 to-fuchsia-100 p-4">
          <ConnectAvatar
            name={post.celebration.staffName}
            photoUrl={post.celebration.staffPhotoUrl}
            size="lg"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700/80">
              {post.celebration.kind === "birthday"
                ? "Birthday"
                : post.celebration.kind === "anniversary"
                  ? "Work anniversary"
                  : "Shout-out"}
            </p>
            <p className="font-serif text-xl leading-snug text-[#3D2A1F]">
              {celebrationHeadline(
                post.celebration.kind,
                post.celebration.staffName,
                post.celebration.years,
              )}
            </p>
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-3">
        {editing ? (
          <EditBody
            initial={post.body}
            onCancel={() => setEditing(false)}
            onSave={(text) =>
              startTransition(async () => {
                const result = await updateConnectPost(post.id, text);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.saved("Post updated.");
                setEditing(false);
                router.refresh();
              })
            }
            pending={pending}
          />
        ) : post.body ? (
          <PostBody text={post.body} />
        ) : null}
      </div>

      {post.attachments.length > 0 ? <Attachments items={post.attachments} /> : null}

      {reactionTotal > 0 || post.comments.length > 0 ? (
        <div className="mx-4 mt-3 flex items-center justify-between text-sm text-black/55">
          <span className="flex items-center gap-1.5">
            {topReactions.length ? (
              <span className="flex -space-x-1">
                {topReactions.map((r) => (
                  <span
                    key={r}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[13px] ring-2 ring-white"
                    title={CONNECT_REACTION_LABELS[r]}
                  >
                    {CONNECT_REACTION_EMOJI[r]}
                  </span>
                ))}
              </span>
            ) : null}
            {reactionTotal > 0 ? reactionTotal : null}
          </span>
          {post.comments.length > 0 ? (
            <button
              type="button"
              className="hover:underline"
              onClick={() => setShowComments((v) => !v)}
            >
              {post.comments.length} comment{post.comments.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>
      ) : null}

      {post.canComment ? (
        <div className="mx-4 mt-2 grid grid-cols-2 gap-1 border-y border-black/5 py-1">
          <ReactionButton current={myReaction} disabled={pending} onReact={react} />
          <button
            type="button"
            onClick={() => {
              setShowComments(true);
              setTimeout(() => commentInputRef.current?.focus(), 0);
            }}
            className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-black/60 hover:bg-black/5"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            Comment
          </button>
        </div>
      ) : (
        <div className="h-3" />
      )}

      {showComments && (post.comments.length > 0 || post.canComment) ? (
        <CommentsSection
          post={post}
          me={me}
          inputRef={commentInputRef}
        />
      ) : (
        <div className="h-2" />
      )}

      <ConfirmDeleteDialog
        open={confirmDelete}
        title="Remove post"
        description="This post, its photos, files and comments will be permanently removed."
        confirmLabel="Remove"
        pending={pending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={runDelete}
      />
    </article>
  );
}

// ---------------------------------------------------------------------------

function PostMenu({
  canEdit,
  canPin,
  canDelete,
  pinned,
  onEdit,
  onPin,
  onDelete,
}: {
  canEdit: boolean;
  canPin: boolean;
  canDelete: boolean;
  pinned: boolean;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const item =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#2B2F16] hover:bg-black/5";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-1.5 text-black/45 hover:bg-black/5 hover:text-black/70"
        aria-label="Post options"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg">
          {canEdit ? (
            <button type="button" className={item} onClick={() => (setOpen(false), onEdit())}>
              <Pencil className="h-4 w-4" aria-hidden /> Edit post
            </button>
          ) : null}
          {canPin ? (
            <button type="button" className={item} onClick={() => (setOpen(false), onPin())}>
              {pinned ? (
                <PinOff className="h-4 w-4" aria-hidden />
              ) : (
                <Pin className="h-4 w-4" aria-hidden />
              )}
              {pinned ? "Unpin" : "Pin to top"}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className={cn(item, "text-red-700")}
              onClick={() => (setOpen(false), onDelete())}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove post
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sky-700 hover:underline"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function PostBody({ text }: { text: string }) {
  const long = text.length > COLLAPSE_AT;
  const [open, setOpen] = useState(!long);
  const shown = open ? text : `${text.slice(0, COLLAPSE_AT).trimEnd()}…`;
  // Short, emoji-heavy posts read bigger, like on social feeds.
  const big = text.length <= 80 && !text.includes("\n");
  return (
    <p
      className={cn(
        "whitespace-pre-wrap break-words text-[#2B2F16]",
        big ? "text-lg" : "text-[15px] leading-relaxed",
      )}
    >
      <Linkified text={shown} />
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-1 font-semibold text-black/55 hover:underline"
        >
          {open ? "See less" : "See more"}
        </button>
      ) : null}
    </p>
  );
}

function EditBody({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        maxLength={5000}
        autoFocus
        className="w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/30"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSave(value)} disabled={pending}>
          Save
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

function Attachments({ items }: { items: ConnectAttachment[] }) {
  const images = items.filter((a) => isImageAttachment(a.contentType));
  const files = items.filter((a) => !isImageAttachment(a.contentType));
  const [lightbox, setLightbox] = useState<number | null>(null);
  const visible = images.slice(0, 4);
  const extra = images.length - visible.length;

  return (
    <div className="mt-3">
      {images.length > 0 ? (
        <div
          className={cn(
            "grid gap-0.5 overflow-hidden bg-black/5",
            visible.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {visible.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightbox(i)}
              className={cn(
                "relative block overflow-hidden bg-[#F4F5EE]",
                visible.length === 1 ? "max-h-[560px]" : "aspect-square",
                visible.length === 3 && i === 0 && "row-span-2 aspect-auto",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.fileUrl}
                alt={img.originalName}
                loading="lazy"
                className={cn(
                  "h-full w-full",
                  visible.length === 1 ? "max-h-[560px] object-contain" : "object-cover",
                )}
              />
              {extra > 0 && i === visible.length - 1 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-3xl font-semibold text-white">
                  +{extra}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="mx-4 mt-3 space-y-2">
          {files.map((f) => (
            <li key={f.id}>
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={f.originalName}
                className="flex items-center gap-3 rounded-xl border border-black/10 bg-[#F9FAF5] px-3 py-2.5 hover:bg-[#F0F3DD]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#2B2F16]">
                    {f.originalName}
                  </span>
                  <span className="text-xs text-black/50">{formatFileSize(f.fileSize)}</span>
                </span>
                <Download className="h-4 w-4 text-black/40" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {lightbox !== null ? (
        <Lightbox images={images} index={lightbox} onChange={setLightbox} onClose={() => setLightbox(null)} />
      ) : null}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onChange,
  onClose,
}: {
  images: ConnectAttachment[];
  index: number;
  onChange: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onChange((index + 1) % images.length);
      if (e.key === "ArrowLeft") onChange((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onChange, onClose]);

  const img = images[index];
  if (!img || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.fileUrl}
        alt={img.originalName}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>
      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), onChange((index - 1 + images.length) % images.length))}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), onChange((index + 1) % images.length))}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Next photo"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
            {index + 1} / {images.length}
          </span>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

function ReactionButton({
  current,
  disabled,
  onReact,
}: {
  current: ConnectReaction | null;
  disabled: boolean;
  onReact: (r: ConnectReaction | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPickerOpen(true);
  };
  const hideSoon = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPickerOpen(false), 350);
  };

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hideSoon}>
      {pickerOpen ? (
        <div className="absolute -top-14 left-0 z-20 flex gap-1 rounded-full border border-black/10 bg-white px-2 py-1.5 shadow-lg">
          {CONNECT_REACTIONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={disabled}
              title={CONNECT_REACTION_LABELS[r]}
              aria-label={CONNECT_REACTION_LABELS[r]}
              onClick={() => {
                setPickerOpen(false);
                onReact(current === r ? null : r);
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-2xl transition-transform hover:-translate-y-1 hover:scale-125",
                current === r && "bg-[#F0F3DD]",
              )}
            >
              {CONNECT_REACTION_EMOJI[r]}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReact(current ? null : "like")}
        onContextMenu={(e) => {
          e.preventDefault();
          show();
        }}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium hover:bg-black/5",
          current ? "text-[var(--venue-primary,#818a40)]" : "text-black/60",
        )}
      >
        {current && current !== "like" ? (
          <span className="text-lg leading-none">{CONNECT_REACTION_EMOJI[current]}</span>
        ) : (
          <ThumbsUp className={cn("h-5 w-5", current === "like" && "fill-current")} aria-hidden />
        )}
        {current ? CONNECT_REACTION_LABELS[current] : "Like"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentsSection({
  post,
  me,
  inputRef,
}: {
  post: ConnectPost;
  me: ConnectPerson | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyTo, setReplyTo] = useState<ConnectComment | null>(null);

  const { roots, replies } = useMemo(() => {
    const rootList = post.comments.filter((c) => !c.parentId);
    const byParent = new Map<string, ConnectComment[]>();
    for (const c of post.comments) {
      if (!c.parentId) continue;
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    }
    return { roots: rootList, replies: byParent };
  }, [post.comments]);

  const hidden = expanded ? 0 : Math.max(0, roots.length - COMMENTS_PREVIEW);
  const shownRoots = roots.slice(hidden);

  return (
    <div className="space-y-3 px-4 pb-4 pt-3">
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm font-semibold text-black/55 hover:underline"
        >
          View {hidden} earlier comment{hidden === 1 ? "" : "s"}
        </button>
      ) : null}

      {shownRoots.map((c) => (
        <div key={c.id} className="space-y-2">
          <CommentBubble
            comment={c}
            canReply={post.canComment}
            canModerate={post.canModerateComments}
            meId={me?.userId ?? null}
            onReply={() => {
              setReplyTo(c);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />
          {(replies.get(c.id) ?? []).length > 0 ? (
            <div className="ml-11 space-y-2 border-l-2 border-black/5 pl-3">
              {(replies.get(c.id) ?? []).map((r) => (
                <CommentBubble
                  key={r.id}
                  comment={r}
                  small
                  canReply={post.canComment}
                  canModerate={post.canModerateComments}
                  meId={me?.userId ?? null}
                  onReply={() => {
                    setReplyTo(c);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}

      {post.canComment ? (
        <CommentInput
          postId={post.id}
          me={me}
          inputRef={inputRef}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
        />
      ) : null}
    </div>
  );
}

function CommentBubble({
  comment,
  small,
  canReply,
  canModerate,
  meId,
  onReply,
}: {
  comment: ConnectComment;
  small?: boolean;
  canReply: boolean;
  canModerate: boolean;
  meId: string | null;
  onReply: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likes, setLikes] = useState(comment.likeCount);
  const [synced, setSynced] = useState(comment);
  if (synced !== comment) {
    setSynced(comment);
    setLiked(comment.likedByMe);
    setLikes(comment.likeCount);
  }

  const isMine = Boolean(meId) && comment.author?.userId === meId;
  const canRemove = isMine || canModerate;
  const name = comment.author?.name ?? "Former user";

  function toggleLike() {
    setLiked((v) => !v);
    setLikes((n) => n + (liked ? -1 : 1));
    startTransition(async () => {
      const result = await toggleConnectCommentLike(comment.id);
      if (!result.ok) {
        toast.error(result.error);
        setLiked(comment.likedByMe);
        setLikes(comment.likeCount);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteConnectComment(comment.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  const action = "font-semibold hover:underline disabled:opacity-50";

  return (
    <div className="flex items-start gap-2">
      <ConnectAvatar name={name} photoUrl={comment.author?.photoUrl} size={small ? "xs" : "sm"} />
      <div className="min-w-0">
        <div className="relative inline-block max-w-full rounded-2xl bg-[#F0F2E8] px-3 py-2">
          <p className="text-[13px] font-semibold text-[#2B2F16]">{name}</p>
          <p className="whitespace-pre-wrap break-words text-sm text-[#2B2F16]">
            <Linkified text={comment.body} />
          </p>
          {likes > 0 ? (
            <span className="absolute -bottom-2.5 -right-2 inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-[11px] text-black/60 shadow">
              👍 {likes}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-3 px-2 text-xs text-black/50">
          <time
            dateTime={comment.createdAt}
            title={formatPostTimestamp(comment.createdAt)}
            suppressHydrationWarning
          >
            {formatPostTime(comment.createdAt)}
          </time>
          {canReply ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={toggleLike}
                className={cn(action, liked && "text-[var(--venue-primary,#818a40)]")}
              >
                Like
              </button>
              <button type="button" onClick={onReply} className={action}>
                Reply
              </button>
            </>
          ) : null}
          {canRemove ? (
            <button type="button" disabled={pending} onClick={remove} className={action}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CommentInput({
  postId,
  me,
  inputRef,
  replyTo,
  onClearReply,
}: {
  postId: string;
  me: ConnectPerson | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  replyTo: ConnectComment | null;
  onClearReply: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");

  function send() {
    const text = value.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addConnectComment(postId, text, replyTo?.id ?? null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setValue("");
      onClearReply();
      router.refresh();
    });
  }

  return (
    <div>
      {replyTo ? (
        <p className="mb-1 ml-11 flex items-center gap-2 text-xs text-black/55">
          Replying to <span className="font-semibold">{replyTo.author?.name ?? "comment"}</span>
          <button type="button" onClick={onClearReply} className="hover:underline">
            Cancel
          </button>
        </p>
      ) : null}
      <div className="flex items-start gap-2">
        <ConnectAvatar name={me?.name ?? "You"} photoUrl={me?.photoUrl} size="sm" />
        <div className="flex flex-1 items-end rounded-2xl bg-[#F0F2E8] pr-1.5 focus-within:ring-2 focus-within:ring-[var(--venue-primary,#818a40)]/30">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-black/40 [field-sizing:content]"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || !value.trim()}
            className="mb-1 rounded-full p-1.5 text-[var(--venue-primary,#818a40)] hover:bg-black/5 disabled:opacity-30"
            aria-label="Send comment"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
