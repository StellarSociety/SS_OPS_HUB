"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Plus, Settings2 } from "lucide-react";
import { GroupBadge } from "@/components/connect/group-icon";
import { GroupDetailsForm } from "@/components/connect/group-settings-panel";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { setConnectGroupArchived } from "@/lib/actions/connect";
import type { ConnectGroup } from "@/lib/connect/types";
import { cn } from "@/lib/utils";
import { toScopedHref } from "@/lib/venue/scope-routing";

export function ConnectGroupsAdmin({
  groups,
  canEdit,
}: {
  groups: ConnectGroup[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const active = groups.filter((g) => !g.archivedAt);
  const archived = groups.filter((g) => g.archivedAt);

  function toggleArchive(group: ConnectGroup) {
    startTransition(async () => {
      const result = await setConnectGroupArchived(group.id, !group.archivedAt);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(group.archivedAt ? `${group.name} restored.` : `${group.name} archived.`);
      router.refresh();
    });
  }

  const row = (g: ConnectGroup) => (
    <li
      key={g.id}
      className={cn("flex flex-wrap items-center gap-3 px-4 py-3", g.archivedAt && "opacity-60")}
    >
      <GroupBadge icon={g.icon} color={g.color} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[#2B2F16]">{g.name}</p>
        <p className="truncate text-sm text-black/50">
          {g.autoMemberRole ? "All staff · " : ""}
          {g.departmentRules.length
            ? `${g.departmentRules.map((r) => r.departmentName).join(", ")} · `
            : ""}
          {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
          {g.description ? ` · ${g.description}` : ""}
        </p>
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          {!g.archivedAt ? (
            <ScopedLink
              href={`/connect/groups/${g.id}/settings`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--venue-secondary,#F0F3DD)] px-3 text-sm font-medium text-[#3D421F] hover:opacity-90"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              Configure
            </ScopedLink>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => toggleArchive(g)}
            title={g.archivedAt ? "Restore group" : "Archive group"}
          >
            {g.archivedAt ? (
              <ArchiveRestore className="h-4 w-4" aria-hidden />
            ) : (
              <Archive className="h-4 w-4" aria-hidden />
            )}
            {g.archivedAt ? "Restore" : "Archive"}
          </Button>
        </div>
      ) : (
        <ScopedLink
          href={`/connect/chats/feed/${g.id}`}
          className="text-sm font-medium text-[#3D421F] hover:underline"
        >
          Open
        </ScopedLink>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      {canEdit ? (
        creating ? (
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold text-[#2B2F16]">New group</h2>
            <GroupDetailsForm
              initial={{ name: "", description: "", icon: "users", color: "#818a40" }}
              submitLabel="Create group"
              onCancel={() => setCreating(false)}
              onSaved={(id) => {
                setCreating(false);
                router.push(toScopedHref(`/connect/groups/${id}/settings`, scope, slug));
              }}
            />
          </Card>
        ) : (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New group
          </Button>
        )
      ) : null}

      <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/5 bg-white">
        {active.map(row)}
      </ul>

      {archived.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/45">
            Archived
          </h2>
          <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/5 bg-white">
            {archived.map(row)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
