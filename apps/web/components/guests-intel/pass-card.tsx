"use client";

import { useTransition } from "react";
import { QrFrame } from "@/components/guests-intel/qr-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { resendGuestPassEmail } from "@/lib/actions/guests-intel";
import { formatDisplayDate } from "@/lib/dates/display";
import { cn } from "@/lib/utils";
import {
  REWARD_KIND_LABELS,
  type IssuedPassView,
} from "@/lib/guests-intel/types";

type PassCardProps = {
  pass: IssuedPassView;
  thankYou?: string;
  allowResend?: boolean;
  compact?: boolean;
};

export function PassCard({
  pass,
  thankYou,
  allowResend = false,
  compact = false,
}: PassCardProps) {
  const [pending, startTransition] = useTransition();
  const expiry = pass.expiresAt
    ? formatDisplayDate(pass.expiresAt.slice(0, 10))
    : "No expiry";

  return (
    <Card className={cn("space-y-5 text-center", compact ? "p-4" : "p-6")}>
      <div>
        <p className="font-serif text-2xl text-[#3D421F]">Your guest pass</p>
        {thankYou ? (
          <p className="mx-auto mt-2 max-w-lg text-sm text-black/55">{thankYou}</p>
        ) : null}
      </div>

      <QrFrame
        svg={pass.qrSvg}
        label="Guest pass QR code"
        defaultSize={compact ? "s" : "xl"}
        showSizeControls={!compact}
      />

      <div className="space-y-1">
        <p className="font-serif text-xl text-[#3D421F]">{pass.rewardTitle}</p>
        <p className="text-sm text-black/55">
          {REWARD_KIND_LABELS[pass.rewardKind]}
          {pass.rewardValueLabel ? ` · ${pass.rewardValueLabel}` : ""}
        </p>
        <p className="font-mono text-lg tracking-[0.18em] text-[#3D421F]">
          {pass.code}
        </p>
        <p className="text-xs text-black/45">Valid until {expiry}</p>
      </div>

      {pass.emailSent ? (
        <p className="text-sm text-[var(--venue-primary,#818a40)]">
          Sent to {pass.email}
        </p>
      ) : (
        <p className="text-sm text-[#b23b2e]">
          {pass.emailError
            ? `Saved, but email did not send: ${pass.emailError}`
            : `Saved. Email to ${pass.email} could not be sent.`}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(pass.code);
              toast.saved("Code copied.");
            } catch {
              toast.error("Could not copy the code.");
            }
          }}
        >
          Copy code
        </Button>
        {allowResend ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await resendGuestPassEmail(pass.issueId);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.saved(`Pass emailed to ${pass.email}.`);
              });
            }}
          >
            {pending ? "Sending…" : "Email again"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
