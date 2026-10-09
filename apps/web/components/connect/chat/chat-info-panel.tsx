"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  CalendarDays,
  LogOut,
  Mail,
  Megaphone,
  Pencil,
  Shield,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { ChatSharedSection } from "@/components/connect/chat/chat-shared-section";
import { ChatAvatar } from "@/components/connect/chat/chat-shell";
import { ChatModal } from "@/components/connect/chat/chat-modal";
import { GroupChatForm } from "@/components/connect/chat/group-chat-form";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { toast } from "@/components/ui/toast";
import {
  archiveGroupChat,
  leaveGroupChat,
  setGroupChatMembers,
} from "@/lib/actions/connect-chat";
import type { ChatDetail, ChatMember } from "@/lib/connect/chat-types";
import type { ConnectPerson } from "@/lib/connect/types";
import { toScopedHref } from "@/lib/venue/scope-routing";

export function ChatInfoPanel({
  detail,
  meId,
  venuePeople,
  latestMessageId,
  onClose,
}: {
  detail: ChatDetail;
  meId: string;
  venuePeople: ConnectPerson[];
  latestMessageId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<"leave" | "delete" | ChatMember | null>(null);
  const isGroup = detail.kind === "group";
  const memberIds = new Set(detail.members.map((m) => m.userId));
  const peopleById = new Map<string, ConnectPerson>([
    ...venuePeople.map((p) => [p.userId, p] as const),
    ...detail.members.map((m) => [m.userId, m.person] as const),
  ]);
  const other = !isGroup ? detail.members.find((m) => m.userId !== meId)?.person : undefined;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.saved(done);
      setConfirm(null);
      after?.();
      router.refresh();
    });
  }

  const backToList = () => router.push(toScopedHref("/connect/chats", scope, slug));

  return (
    <aside className="absolute inset-0 z-10 flex min-h-0 w-full flex-col border-l border-black/5 bg-white md:static md:w-80">
      <header className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-[#2B2F16]">
          {isGroup ? "Group info" : "Chat info"}
        </h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-black/45 hover:bg-black/5" aria-label="Close info">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {other ? (
            <ConnectAvatar name={other.name} photoUrl={other.photoUrl} size="lg" className="h-24 w-24 text-2xl" />
          ) : (
            <ChatAvatar chat={detail} />
          )}
          <p className="text-lg font-semibold text-[#2B2F16]">{detail.title}</p>
          {other?.positionName ?? detail.contact?.positionName ? (
            <p className="-mt-1.5 text-sm text-black/55">
              {other?.positionName ?? detail.contact?.positionName}
            </p>
          ) : null}
          {isGroup && detail.description ? (
            <p className="text-sm text-black/55">{detail.description}</p>
          ) : null}
          {isGroup && detail.onlyAdminsCanPost ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
              <Megaphone className="h-3.5 w-3.5" aria-hidden /> Only admins can send messages
            </p>
          ) : null}
          {detail.canManage ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden /> Edit chat & access
            </Button>
          ) : null}
        </div>

        {other ? <ContactDetails person={other} contact={detail.contact} /> : null}

        <ChatSharedSection
          conversationId={detail.id}
          refreshKey={latestMessageId}
          peopleById={peopleById}
        />

        {isGroup ? (
          <section className="space-y-2 border-t border-black/5 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">
              Members · {detail.members.length}
            </h3>
            {detail.canAddMembers ? (
              <div className="flex gap-2">
                <SearchableMultiSelect
                  values={toAdd}
                  onChange={setToAdd}
                  options={venuePeople
                    .filter((p) => !memberIds.has(p.userId))
                    .map((p) => ({
                      value: p.userId,
                      label: p.name,
                      searchText: [p.positionName, p.departmentName].filter(Boolean).join(" "),
                    }))}
                  placeholder="Add people…"
                  searchPlaceholder="Search people"
                  className="flex-1"
                  disabled={pending}
                  aria-label="Add people"
                />
                <Button
                  type="button"
                  size="icon"
                  disabled={pending || toAdd.length === 0}
                  onClick={() =>
                    run(
                      () => setGroupChatMembers(detail.id, toAdd, "member"),
                      `Added ${toAdd.length} ${toAdd.length === 1 ? "person" : "people"}.`,
                      () => setToAdd([]),
                    )
                  }
                  aria-label="Add selected people"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            <ul className="space-y-1">
              {detail.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                  <ConnectAvatar name={m.person.name} photoUrl={m.person.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#2B2F16]">
                      {m.person.name}
                      {m.userId === meId ? " (you)" : ""}
                    </span>
                    <span className="block truncate text-xs text-black/50">
                      {m.role === "admin" ? "Chat admin" : (m.person.positionName ?? "Member")}
                    </span>
                  </span>
                  {detail.canManage && m.userId !== meId ? (
                    <span className="flex">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => setGroupChatMembers(detail.id, [m.userId], m.role === "admin" ? "member" : "admin"),
                            m.role === "admin" ? `${m.person.name} is now a member.` : `${m.person.name} is now a chat admin.`,
                          )
                        }
                        className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black/70"
                        title={m.role === "admin" ? "Remove admin rights" : "Make chat admin"}
                        aria-label={m.role === "admin" ? `Remove admin rights from ${m.person.name}` : `Make ${m.person.name} a chat admin`}
                      >
                        {m.role === "admin" ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirm(m)}
                        className="rounded-md p-1.5 text-black/40 hover:bg-red-50 hover:text-red-700"
                        title="Remove from chat"
                        aria-label={`Remove ${m.person.name}`}
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isGroup ? (
          <section className="space-y-2 border-t border-black/5 pt-4">
            <button
              type="button"
              onClick={() => setConfirm("leave")}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Leave chat
            </button>
            {detail.canManage ? (
              <button
                type="button"
                onClick={() => setConfirm("delete")}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete chat for everyone
              </button>
            ) : null}
          </section>
        ) : null}
      </div>

      {editing ? (
        <ChatModal title="Edit chat" onClose={() => setEditing(false)}>
          <GroupChatForm
            conversationId={detail.id}
            initial={{
              name: detail.title,
              description: detail.description,
              color: detail.color,
              onlyAdminsCanPost: detail.onlyAdminsCanPost,
              membersCanAdd: detail.membersCanAdd,
            }}
            onDone={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        </ChatModal>
      ) : null}

      <ConfirmDeleteDialog
        open={confirm !== null}
        title={
          confirm === "leave"
            ? "Leave chat"
            : confirm === "delete"
              ? "Delete chat"
              : "Remove from chat"
        }
        subject={typeof confirm === "object" && confirm ? confirm.person.name : detail.title}
        description={
          confirm === "leave"
            ? "You'll stop receiving messages from this chat."
            : confirm === "delete"
              ? "The chat disappears for every member. This can't be undone from the app."
              : "They'll no longer see this chat or get its messages."
        }
        confirmLabel={confirm === "leave" ? "Leave" : confirm === "delete" ? "Delete" : "Remove"}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "leave") {
            run(() => leaveGroupChat(detail.id), "You left the chat.", backToList);
          } else if (confirm === "delete") {
            run(() => archiveGroupChat(detail.id), "Chat deleted.", backToList);
          } else if (confirm) {
            run(() => setGroupChatMembers(detail.id, [confirm.userId], null), `${confirm.person.name} removed.`);
          }
        }}
      />
    </aside>
  );
}

function yearsSince(iso: string): string | null {
  const start = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const months =
    (new Date().getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (new Date().getUTCMonth() - start.getUTCMonth());
  if (months < 1) return "Just joined";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

/** The other person's work details in a 1:1 chat. */
function ContactDetails({
  person,
  contact,
}: {
  person: ConnectPerson;
  contact: ChatDetail["contact"];
}) {
  const joined = contact?.joiningDate ?? null;
  const rows: { icon: typeof Mail; label: string; value: React.ReactNode }[] = [];
  rows.push({
    icon: Briefcase,
    label: "Position",
    value: person.positionName ?? contact?.positionName ?? "—",
  });
  rows.push({
    icon: Building2,
    label: "Department",
    value: person.departmentName ?? contact?.departmentName ?? "—",
  });
  if (contact?.email) {
    rows.push({
      icon: Mail,
      label: "Email",
      value: (
        <a href={`mailto:${contact.email}`} className="break-all text-sky-700 hover:underline">
          {contact.email}
        </a>
      ),
    });
  }
  if (joined) {
    const [y, m, d] = joined.slice(0, 10).split("-");
    rows.push({
      icon: CalendarDays,
      label: "With the team since",
      value: `${d}-${m}-${y!.slice(2)}${yearsSince(joined) ? ` · ${yearsSince(joined)}` : ""}`,
    });
  }
  return (
    <section className="space-y-2 border-t border-black/5 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">Details</h3>
      <dl className="space-y-2.5">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.label} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-black/40" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] text-black/45">{r.label}</dt>
                <dd className="text-sm text-[#2B2F16]">{r.value}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
