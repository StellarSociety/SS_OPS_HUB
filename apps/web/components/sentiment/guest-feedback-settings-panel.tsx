"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QrFrame } from "@/components/guests-intel/qr-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  rotateGuestFeedbackLink,
  saveGuestFeedbackSettings,
} from "@/lib/actions/guest-feedback";
import type { GuestFeedbackSettings } from "@/lib/sentiment/guest-feedback/types";

export function GuestFeedbackSettingsPanel({
  settings,
  formUrl,
  formQrSvg,
  canEdit,
}: {
  settings: GuestFeedbackSettings;
  formUrl: string;
  formQrSvg: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings.enabled);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-serif text-2xl text-[#3D421F]">Guest page</h2>
          <p className="mt-1 text-sm text-black/55">
            This is the copy guests see when they open the short link after a
            visit.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            const formData = new FormData(event.currentTarget);
            formData.set("enabled", enabled ? "on" : "off");
            startTransition(async () => {
              const result = await saveGuestFeedbackSettings(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.saved("Guest page saved.");
              router.refresh();
            });
          }}
        >
          <label className="flex items-center gap-2 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit || pending}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Page is live for guests
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="form_title">Title</Label>
            <Input
              id="form_title"
              name="form_title"
              defaultValue={settings.form_title}
              disabled={!canEdit || pending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="form_intro">Intro</Label>
            <Textarea
              id="form_intro"
              name="form_intro"
              defaultValue={settings.form_intro}
              disabled={!canEdit || pending}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="thank_you_message">Thank-you message</Label>
            <Textarea
              id="thank_you_message"
              name="thank_you_message"
              defaultValue={settings.thank_you_message}
              disabled={!canEdit || pending}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promotions_heading">Promotions heading</Label>
            <Input
              id="promotions_heading"
              name="promotions_heading"
              defaultValue={settings.promotions_heading}
              disabled={!canEdit || pending}
            />
            <p className="text-xs text-black/45">
              Shown above current promotions, e.g. Orilla rituals.
            </p>
          </div>
          {canEdit ? (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save page"}
            </Button>
          ) : (
            <p className="text-sm text-black/45">
              You can view this page, but saving needs Guest Feedback editor access.
            </p>
          )}
        </form>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-serif text-2xl text-[#3D421F]">Share with guests</h2>
          <p className="mt-1 text-sm text-black/55">
            Send the short link by WhatsApp or SMS, or display the QR at the
            table.
          </p>
        </div>
        {settings.enabled && formQrSvg ? (
          <>
            <QrFrame svg={formQrSvg} label="Guest feedback QR" defaultSize="m" />
            <p className="break-all text-center font-mono text-sm text-[#3D421F]">
              {formUrl}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(formUrl);
                    toast.saved("Link copied.");
                  } catch {
                    toast.error("Could not copy the link.");
                  }
                }}
              >
                Copy link
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await rotateGuestFeedbackLink();
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.saved("New short link created. Old links will stop working.");
                      router.refresh();
                    });
                  }}
                >
                  New short code
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-black/55">
            Turn the page on to share a short link and QR with guests.
          </p>
        )}
      </Card>
    </div>
  );
}
