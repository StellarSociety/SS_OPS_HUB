"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveScheduleApprovalSettings } from "@/lib/actions/hr-schedule-approval";
import type { ScheduleApproverCandidate } from "@/lib/actions/hr-schedule-approval";
import type { HrScheduleApprovalSettings } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

type ScheduleApprovalSettingsPanelProps = {
  settings: HrScheduleApprovalSettings;
  candidates: ScheduleApproverCandidate[];
};

export function ScheduleApprovalSettingsPanel({
  settings,
  candidates,
}: ScheduleApprovalSettingsPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(settings.approverUserIds),
  );

  const selectedIds = useMemo(() => [...selected].join(","), [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card className="p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">Schedule Approval</h2>
      <p className="mt-1 text-sm text-black/55">
        Choose who can be asked to approve weekly schedules. Editors pick from
        this list when sending a week for approval. Approvers can revise the
        roster and confirm publish so Editors can download the schedule PDF.
      </p>

      <form action={saveScheduleApprovalSettings} className="mt-4 space-y-4">
        <input type="hidden" name="approver_user_ids" value={selectedIds} />

        {candidates.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
            No users with Schedules edit access were found for this venue. Grant
            edit access in Settings → Users first.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
            {candidates.map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02]",
                      checked && "bg-[var(--venue-secondary)]/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[#3D421F]">
                        {c.fullName}
                      </span>
                      <span className="block truncate text-xs text-black/45">
                        {c.email}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-black/45">
          {selected.size} approver{selected.size === 1 ? "" : "s"} selected
        </p>
        <SaveButton />
      </form>
    </Card>
  );
}
