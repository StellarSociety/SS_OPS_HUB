"use client";

import { useState, useTransition } from "react";
import { GuestFormFields } from "@/components/guests-intel/guest-form-fields";
import { PassCard } from "@/components/guests-intel/pass-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { submitPublicGuestForm } from "@/lib/actions/guests-intel-public";
import type {
  GuestsIntelSettings,
  IssuedPassView,
} from "@/lib/guests-intel/types";

type PublicGuestFormProps = {
  token: string;
  venueName: string;
  venueLogoUrl: string | null;
  settings: GuestsIntelSettings;
};

export function PublicGuestForm({
  token,
  venueName,
  venueLogoUrl,
  settings,
}: PublicGuestFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState<IssuedPassView | null>(null);

  return (
    <Card className="w-full max-w-lg space-y-5 p-6 shadow-sm">
      <div className="text-center">
        {venueLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venueLogoUrl}
            alt={venueName}
            className="mx-auto mb-3 h-12 w-auto"
          />
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
          {venueName}
        </p>
        <h1 className="mt-2 font-serif text-2xl text-[#3D421F]">
          {settings.form_title}
        </h1>
        {settings.form_intro ? (
          <p className="mt-2 text-sm text-black/55">{settings.form_intro}</p>
        ) : null}
      </div>

      {pass ? (
        <PassCard pass={pass} thankYou={settings.thank_you_message} />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              const result = await submitPublicGuestForm(token, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setPass(result.pass);
            });
          }}
        >
          <GuestFormFields
            defaultRewardId={settings.default_reward_id}
            disabled={pending}
            idPrefix="public-guest"
          />
          {error ? <p className="text-sm text-[#b23b2e]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending your pass…" : "Submit and get my pass"}
          </Button>
        </form>
      )}
    </Card>
  );
}
