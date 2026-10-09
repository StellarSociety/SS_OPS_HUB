"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserMinus } from "lucide-react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { GroupBadge } from "@/components/connect/group-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { saveConnectGroup, setConnectGroupMembers } from "@/lib/actions/connect";
import {
  CONNECT_GROUP_ICONS,
  CONNECT_GROUP_ROLE_HINTS,
  CONNECT_GROUP_ROLE_LABELS,
  CONNECT_GROUP_ROLES,
  type ConnectGroupMember,
  type ConnectGroupRole,
  type ConnectPerson,
} from "@/lib/connect/types";
import { cn } from "@/lib/utils";

export const CONNECT_GROUP_COLORS = [
  "#818a40",
  "#B4532A",
  "#2F6F8F",
  "#8A5A2B",
  "#7A3E7A",
  "#3F7D5A",
  "#B8860B",
  "#C2410C",
  "#4F46E5",
  "#BE185D",
  "#334155",
  "#0E7490",
];

export type GroupDetailsValue = {
  id?: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
};

/** Name, description, icon and colour — used for new and existing groups. */
export function GroupDetailsForm({
  initial,
  submitLabel,
  onSaved,
  onCancel,
}: {
  initial: GroupDetailsValue;
  submitLabel: string;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);

  function save() {
    startTransition(async () => {
      const result = await saveConnectGroup(value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(initial.id ? "Group saved." : "Group created.");
      onSaved?.(result.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <GroupBadge icon={value.icon} color={value.color} size="lg" />
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="group-name">Group name</Label>
          <Input
            id="group-name"
            value={value.name}
            maxLength={60}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
            placeholder="e.g. Kitchen Team"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          value={value.description}
          maxLength={300}
          rows={2}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
          placeholder="What is this group for?"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-[#3D421F]">Icon</legend>
          <div className="flex flex-wrap gap-1.5">
            {CONNECT_GROUP_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setValue({ ...value, icon })}
                className={cn(
                  "rounded-xl p-0.5 ring-2 ring-transparent",
                  value.icon === icon && "ring-[#3D421F]",
                )}
                aria-label={icon}
                aria-pressed={value.icon === icon}
              >
                <GroupBadge icon={icon} color={value.color} size="sm" />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-[#3D421F]">Colour</legend>
          <div className="flex flex-wrap gap-1.5">
            {CONNECT_GROUP_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setValue({ ...value, color })}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-transparent"
                style={{
                  backgroundColor: color,
                  ...(value.color === color ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${color}` } : {}),
                }}
                aria-label={`Colour ${color}`}
                aria-pressed={value.color === color}
              >
                {value.color === color ? <Check className="h-4 w-4" /> : null}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" onClick={save} disabled={pending || !value.name.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Per-employee group rights: Group Admin, Moderator, Contributor, Viewer. */
export function GroupMembersEditor({
  groupId,
  members,
  candidates,
  hasAutoRules,
}: {
  groupId: string;
  members: ConnectGroupMember[];
  candidates: ConnectPerson[];
  /** Everyone / department rules are on — removing a manual role may keep them in. */
  hasAutoRules: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [addRole, setAddRole] = useState<ConnectGroupRole>("contributor");
  const [removing, setRemoving] = useState<ConnectGroupMember | null>(null);
  const [filter, setFilter] = useState<ConnectGroupRole | "all">("all");

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const options = candidates
    .filter((c) => !memberIds.has(c.userId))
    .map((c) => ({
      value: c.userId,
      label: c.name,
      searchText: [c.positionName, c.departmentName].filter(Boolean).join(" "),
    }));

  const counts = CONNECT_GROUP_ROLES.reduce(
    (acc, role) => ({ ...acc, [role]: members.filter((m) => m.role === role).length }),
    {} as Record<ConnectGroupRole, number>,
  );
  const shown = filter === "all" ? members : members.filter((m) => m.role === filter);

  function run(userIds: string[], role: ConnectGroupRole | null, message: string) {
    startTransition(async () => {
      const result = await setConnectGroupMembers(groupId, userIds, role);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm font-medium text-[#3D421F]">Add people</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchableMultiSelect
            values={toAdd}
            onChange={setToAdd}
            options={options}
            placeholder={
              options.length ? "Choose employees…" : "Everyone is already a member — change roles below"
            }
            searchPlaceholder="Search by name or position"
            className="flex-1"
            disabled={pending || options.length === 0}
            aria-label="Employees to add"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as ConnectGroupRole)}
            className="h-10 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]"
            aria-label="Role for new members"
          >
            {CONNECT_GROUP_ROLES.map((role) => (
              <option key={role} value={role}>
                {CONNECT_GROUP_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={pending || toAdd.length === 0}
            onClick={() => {
              run(toAdd, addRole, `Added ${toAdd.length} member${toAdd.length === 1 ? "" : "s"}.`);
              setToAdd([]);
            }}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-black/50">{CONNECT_GROUP_ROLE_HINTS[addRole]}</p>
        <p className="text-xs text-black/40">
          Only employees with a Hub login are listed.
        </p>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...CONNECT_GROUP_ROLES] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              filter === key
                ? "bg-[#3D421F] text-white"
                : "bg-black/5 text-black/60 hover:bg-black/10",
            )}
          >
            {key === "all" ? `All · ${members.length}` : `${CONNECT_GROUP_ROLE_LABELS[key]} · ${counts[key]}`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-black/50">
          {members.length === 0 ? "No members yet — add people above." : "Nobody with this role."}
        </p>
      ) : (
        <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/5 bg-white">
          {shown.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <ConnectAvatar name={m.person.name} photoUrl={m.person.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-[#2B2F16]">
                  {m.person.name}
                  {m.autoSource ? (
                    <span
                      className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-normal text-black/50"
                      title="Added automatically"
                    >
                      Auto · {m.autoSource}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-black/50">
                  {[m.person.positionName, m.person.departmentName].filter(Boolean).join(" · ") ||
                    "—"}
                </p>
              </div>
              <select
                value={m.role}
                disabled={pending}
                onChange={(e) => {
                  const role = e.target.value as ConnectGroupRole;
                  run([m.userId], role, `${m.person.name} is now ${CONNECT_GROUP_ROLE_LABELS[role]}.`);
                }}
                className="h-9 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]"
                aria-label={`Role for ${m.person.name}`}
                title={CONNECT_GROUP_ROLE_HINTS[m.role]}
              >
                {CONNECT_GROUP_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {CONNECT_GROUP_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              {m.auto ? (
                <span className="w-8" aria-hidden />
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setRemoving(m)}
                  className="rounded-md p-2 text-black/40 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Remove ${m.person.name}'s manual role`}
                  title={hasAutoRules ? "Remove manual role" : "Remove from group"}
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={removing !== null}
        title={hasAutoRules ? "Remove manual role" : "Remove from group"}
        subject={removing?.person.name}
        description={
          hasAutoRules
            ? "If an automatic rule includes them, they stay in the group with that role; otherwise they leave the group. Their past posts and comments stay."
            : "They will no longer see this group's posts. Their past posts and comments stay."
        }
        confirmLabel="Remove"
        pending={pending}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          run(
            [removing.userId],
            null,
            hasAutoRules
              ? `${removing.person.name}'s manual role removed.`
              : `${removing.person.name} removed.`,
          );
          setRemoving(null);
        }}
      />
    </div>
  );
}

export function RoleLegend() {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {CONNECT_GROUP_ROLES.map((role) => (
        <div key={role} className="rounded-xl bg-[#F4F5EE] px-3 py-2">
          <dt className="text-sm font-semibold text-[#2B2F16]">{CONNECT_GROUP_ROLE_LABELS[role]}</dt>
          <dd className="text-xs text-black/55">{CONNECT_GROUP_ROLE_HINTS[role]}</dd>
        </div>
      ))}
    </dl>
  );
}
