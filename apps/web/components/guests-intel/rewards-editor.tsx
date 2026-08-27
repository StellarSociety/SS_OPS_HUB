"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  archiveGuestReward,
  saveGuestReward,
} from "@/lib/actions/guests-intel";
import {
  REWARD_KIND_LABELS,
  REWARD_KINDS,
  type GuestsIntelReward,
} from "@/lib/guests-intel/types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-[16px] text-[#3D421F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40] md:text-sm";

type RewardsEditorProps = {
  rewards: GuestsIntelReward[];
  canEdit: boolean;
};

export function RewardsEditor({ rewards, canEdit }: RewardsEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        These are the promotions, vouchers, discounts, and complementary items a
        guest pass can redeem.
      </p>

      <ul className="space-y-3">
        {rewards.map((reward) => (
          <li key={reward.id}>
            <RewardRow
              reward={reward}
              canEdit={canEdit}
              busy={pending}
              onChanged={() => router.refresh()}
            />
          </li>
        ))}
      </ul>

      {canEdit && adding ? (
        <RewardForm
          busy={pending}
          onCancel={() => setAdding(false)}
          onSave={(formData) => {
            startTransition(async () => {
              const result = await saveGuestReward(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.saved("Reward added.");
              setAdding(false);
              router.refresh();
            });
          }}
        />
      ) : null}

      {canEdit && !adding ? (
        <Button type="button" onClick={() => setAdding(true)}>
          Add reward
        </Button>
      ) : null}
    </div>
  );
}

function RewardRow({
  reward,
  canEdit,
  busy,
  onChanged,
}: {
  reward: GuestsIntelReward;
  canEdit: boolean;
  busy: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const archived = Boolean(reward.archived_at);

  if (editing) {
    return (
      <RewardForm
        reward={reward}
        busy={pending}
        onCancel={() => setEditing(false)}
        onSave={(formData) => {
          startTransition(async () => {
            const result = await saveGuestReward(formData);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.saved("Reward saved.");
            setEditing(false);
            onChanged();
          });
        }}
      />
    );
  }

  return (
    <Card className={cn("p-5", archived && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl text-[#3D421F]">{reward.title}</p>
          <p className="mt-1 text-sm text-black/55">
            {REWARD_KIND_LABELS[reward.kind]}
            {reward.value_label ? ` · ${reward.value_label}` : ""}
            {reward.valid_days != null ? ` · ${reward.valid_days} days` : ""}
            {!reward.active ? " · Inactive" : ""}
            {archived ? " · Archived" : ""}
          </p>
          {reward.description ? (
            <p className="mt-2 text-sm text-black/60">{reward.description}</p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || pending}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await archiveGuestReward(reward.id, archived);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.saved(archived ? "Reward restored." : "Reward archived.");
                  onChanged();
                });
              }}
            >
              {archived ? "Restore" : "Archive"}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function RewardForm({
  reward,
  busy,
  onCancel,
  onSave,
}: {
  reward?: GuestsIntelReward;
  busy: boolean;
  onCancel: () => void;
  onSave: (formData: FormData) => void;
}) {
  return (
    <Card className="space-y-4 p-5">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(new FormData(event.currentTarget));
        }}
      >
        {reward ? <input type="hidden" name="id" value={reward.id} /> : null}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="reward-title">Title</Label>
          <Input
            id="reward-title"
            name="title"
            required
            defaultValue={reward?.title ?? ""}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reward-kind">Type</Label>
          <select
            id="reward-kind"
            name="kind"
            className={selectClass}
            defaultValue={reward?.kind ?? "complimentary"}
            disabled={busy}
          >
            {REWARD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {REWARD_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reward-value">Value label</Label>
          <Input
            id="reward-value"
            name="value_label"
            placeholder="10% off food"
            defaultValue={reward?.value_label ?? ""}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reward-days">Valid days</Label>
          <Input
            id="reward-days"
            name="valid_days"
            type="number"
            min={0}
            placeholder="Uses Settings default if blank"
            defaultValue={reward?.valid_days ?? ""}
            disabled={busy}
          />
        </div>
        <label className="flex items-center gap-2 self-end text-sm text-[#3D421F]">
          <input
            type="checkbox"
            name="active"
            value="on"
            defaultChecked={reward?.active ?? true}
            disabled={busy}
          />
          Active
        </label>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="reward-desc">Description</Label>
          <Textarea
            id="reward-desc"
            name="description"
            defaultValue={reward?.description ?? ""}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="reward-terms">Terms</Label>
          <Textarea
            id="reward-terms"
            name="terms"
            defaultValue={reward?.terms ?? ""}
            disabled={busy}
          />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
