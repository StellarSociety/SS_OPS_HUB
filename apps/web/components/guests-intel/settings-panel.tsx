"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { saveGuestsIntelSettings } from "@/lib/actions/guests-intel";
import { REWARD_KIND_LABELS, type GuestsIntelReward, type GuestsIntelSettings } from "@/lib/guests-intel/types";

const selectClass =
  "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-[16px] text-[#3D421F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40] md:text-sm";

type SettingsPanelProps = {
  settings: GuestsIntelSettings;
  rewards: GuestsIntelReward[];
  formUrl: string;
  canEdit: boolean;
};

export function GuestsIntelSettingsPanel({
  settings,
  rewards,
  formUrl,
  canEdit,
}: SettingsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activeRewards = rewards.filter((reward) => reward.active && !reward.archived_at);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveGuestsIntelSettings(formData);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.saved("Settings saved.");
          router.refresh();
        });
      }}
    >
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-serif text-2xl text-[#3D421F]">Reservations email</h2>
          <p className="mt-1 text-sm text-black/55">
            Guest pass emails send from this address. Add a matching mailbox in
            Venue Settings → Email config so delivery works.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="from_email">From email</Label>
            <Input
              id="from_email"
              name="from_email"
              type="email"
              required
              defaultValue={settings.from_email}
              disabled={!canEdit || pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from_name">From name</Label>
            <Input
              id="from_name"
              name="from_name"
              required
              defaultValue={settings.from_name}
              disabled={!canEdit || pending}
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-serif text-2xl text-[#3D421F]">Guest form</h2>
          <p className="mt-1 text-sm text-black/55">
            Copy shown on the public form and after a pass is issued.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="form_title">Form title</Label>
          <Input
            id="form_title"
            name="form_title"
            required
            defaultValue={settings.form_title}
            disabled={!canEdit || pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="form_intro">Intro</Label>
          <Textarea
            id="form_intro"
            name="form_intro"
            defaultValue={settings.form_intro}
            disabled={!canEdit || pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="thank_you_message">Thank-you message</Label>
          <Textarea
            id="thank_you_message"
            name="thank_you_message"
            defaultValue={settings.thank_you_message}
            disabled={!canEdit || pending}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="default_reward_id">Default public reward</Label>
            <select
              id="default_reward_id"
              name="default_reward_id"
              className={selectClass}
              defaultValue={settings.default_reward_id ?? ""}
              disabled={!canEdit || pending}
            >
              <option value="">None</option>
              {activeRewards.map((reward) => (
                <option key={reward.id} value={reward.id}>
                  {reward.title} · {REWARD_KIND_LABELS[reward.kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valid_days">Default valid days</Label>
            <Input
              id="valid_days"
              name="valid_days"
              type="number"
              min={0}
              defaultValue={settings.valid_days}
              disabled={!canEdit || pending}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            name="public_form_enabled"
            value="on"
            defaultChecked={settings.public_form_enabled}
            disabled={!canEdit || pending}
          />
          Public guest form enabled
        </label>
        <div className="rounded-lg border border-black/10 bg-white/50 px-3 py-2 text-xs text-black/55">
          Share link: {formUrl || "—"}
        </div>
        {canEdit ? (
          <label className="flex items-center gap-2 text-sm text-[#3D421F]">
            <input type="checkbox" name="rotate_token" value="1" disabled={pending} />
            Rotate the public link (the current QR and URL will stop working)
          </label>
        ) : null}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-serif text-2xl text-[#3D421F]">Email copy</h2>
          <p className="mt-1 text-sm text-black/55">
            Use {"{{venue}}"}, {"{{name}}"}, {"{{reward}}"}, or {"{{code}}"} in the
            subject.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email_subject">Subject</Label>
          <Input
            id="email_subject"
            name="email_subject"
            defaultValue={settings.email_subject}
            disabled={!canEdit || pending}
          />
        </div>
      </Card>

      {canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      ) : (
        <p className="text-sm text-black/45">
          Changing these options needs Guests Intel Settings admin access.
        </p>
      )}
    </form>
  );
}
