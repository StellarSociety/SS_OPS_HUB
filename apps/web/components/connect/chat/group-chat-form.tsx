"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { CONNECT_GROUP_COLORS } from "@/components/connect/group-settings-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { createGroupChat, updateGroupChat } from "@/lib/actions/connect-chat";
import type { ConnectPerson } from "@/lib/connect/types";

export type GroupChatFormValue = {
  name: string;
  description: string;
  color: string;
  onlyAdminsCanPost: boolean;
  membersCanAdd: boolean;
};

/** Create a group chat (with members) or edit an existing one's settings. */
export function GroupChatForm({
  people = [],
  conversationId,
  initial,
  onDone,
}: {
  people?: ConnectPerson[];
  conversationId?: string;
  initial?: GroupChatFormValue;
  onDone: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<GroupChatFormValue>(
    initial ?? {
      name: "",
      description: "",
      color: "#818a40",
      onlyAdminsCanPost: false,
      membersCanAdd: false,
    },
  );
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const editing = Boolean(conversationId);

  function save() {
    startTransition(async () => {
      const result = editing
        ? await updateGroupChat(conversationId!, value)
        : await createGroupChat({ ...value, memberIds });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(editing ? "Chat settings saved." : "Group chat created.");
      onDone("id" in result ? (result.id as string) : conversationId!);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="chat-name">Name</Label>
        <Input
          id="chat-name"
          value={value.name}
          maxLength={60}
          autoFocus={!editing}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
          placeholder="e.g. Closing shift"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="chat-description">Description</Label>
        <Textarea
          id="chat-description"
          rows={2}
          maxLength={300}
          value={value.description}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
          placeholder="What is this chat for?"
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-[#3D421F]">Colour</legend>
        <div className="flex flex-wrap gap-1.5">
          {CONNECT_GROUP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setValue({ ...value, color })}
              className="flex h-7 w-7 items-center justify-center rounded-full text-white"
              style={{
                backgroundColor: color,
                ...(value.color === color ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${color}` } : {}),
              }}
              aria-label={`Colour ${color}`}
              aria-pressed={value.color === color}
            >
              {value.color === color ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
          ))}
        </div>
      </fieldset>

      {!editing ? (
        <div className="space-y-1.5">
          <Label>Members</Label>
          <SearchableMultiSelect
            values={memberIds}
            onChange={setMemberIds}
            options={people.map((p) => ({
              value: p.userId,
              label: p.name,
              searchText: [p.positionName, p.departmentName].filter(Boolean).join(" "),
            }))}
            placeholder="Choose people…"
            searchPlaceholder="Search by name or position"
            aria-label="Members"
          />
          <p className="text-xs text-black/50">You&apos;ll be the chat admin. You can add more people later.</p>
        </div>
      ) : null}

      <fieldset className="space-y-2 rounded-xl bg-[#F4F5EE] p-3">
        <legend className="sr-only">Access options</legend>
        <Toggle
          checked={value.onlyAdminsCanPost}
          onChange={(v) => setValue({ ...value, onlyAdminsCanPost: v })}
          label="Only admins can send messages"
          hint="Announcement-style chat: members read and get notified."
        />
        <Toggle
          checked={value.membersCanAdd}
          onChange={(v) => setValue({ ...value, membersCanAdd: v })}
          label="Members can add people"
          hint="Otherwise only chat admins add and remove members."
        />
      </fieldset>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={pending || !value.name.trim()}>
          {pending ? "Saving…" : editing ? "Save" : "Create chat"}
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--venue-primary,#818a40)]"
      />
      <span>
        <span className="block text-sm font-medium text-[#2B2F16]">{label}</span>
        <span className="block text-xs text-black/55">{hint}</span>
      </span>
    </label>
  );
}
