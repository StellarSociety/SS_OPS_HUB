"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { GuestFeedbackSocialIcon } from "@/components/sentiment/guest-feedback-social-icon";
import { saveGuestFeedbackSocials } from "@/lib/actions/guest-feedback";
import {
  EMAIL_CHROME_SOCIAL_LINKS,
  emailChromeSocialFormName,
  type EmailChromeSocialLinkKey,
} from "@/lib/hr/types";

type SocialValues = Record<EmailChromeSocialLinkKey, string>;

export function GuestFeedbackSocialsEditor({
  values: initial,
  canEdit,
}: {
  values: SocialValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<SocialValues>(initial);

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Social pages</h2>
        <p className="mt-1 text-sm text-black/55">
          These are the same website, review, and social accounts used across
          the Hub. After a guest submits feedback, every filled link appears on
          the thank-you screen.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canEdit) return;
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await saveGuestFeedbackSocials(formData);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.saved("Social pages saved.");
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {EMAIL_CHROME_SOCIAL_LINKS.map((row) => (
            <div key={row.key} className="space-y-1.5">
              <Label
                htmlFor={`gf-social-${row.key}`}
                className="inline-flex items-center gap-2.5"
              >
                <GuestFeedbackSocialIcon icon={row.icon} />
                {row.label}
              </Label>
              <Input
                id={`gf-social-${row.key}`}
                name={emailChromeSocialFormName(row.key)}
                type="url"
                value={values[row.key] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [row.key]: event.target.value,
                  }))
                }
                placeholder={row.placeholder}
                disabled={!canEdit || pending}
              />
            </div>
          ))}
        </div>
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save social pages"}
          </Button>
        ) : (
          <p className="text-sm text-black/45">
            You can view this page, but saving needs Guest Feedback editor
            access.
          </p>
        )}
      </form>
    </Card>
  );
}
