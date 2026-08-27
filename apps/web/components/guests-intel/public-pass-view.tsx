import { QrFrame } from "@/components/guests-intel/qr-frame";
import { Card } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  REWARD_KIND_LABELS,
  formatIssueStatus,
  type GuestsIntelGuest,
  type GuestsIntelIssue,
  type GuestsIntelReward,
} from "@/lib/guests-intel/types";

type PublicPassViewProps = {
  venueName: string;
  venueLogoUrl: string | null;
  guest: GuestsIntelGuest;
  reward: GuestsIntelReward;
  issue: GuestsIntelIssue;
  qrSvg: string;
};

export function PublicPassView({
  venueName,
  venueLogoUrl,
  guest,
  reward,
  issue,
  qrSvg,
}: PublicPassViewProps) {
  const expiry = issue.expires_at
    ? formatDisplayDate(issue.expires_at.slice(0, 10))
    : "No expiry";

  return (
    <Card className="w-full max-w-lg space-y-5 p-6 text-center shadow-sm">
      {venueLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={venueLogoUrl} alt={venueName} className="mx-auto h-12 w-auto" />
      ) : null}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
          {venueName}
        </p>
        <h1 className="mt-2 font-serif text-2xl text-[#3D421F]">Guest pass</h1>
        <p className="mt-1 text-sm text-black/55">
          Hi {guest.first_name} — show this QR to redeem your offer.
        </p>
      </div>
      <QrFrame svg={qrSvg} label="Guest pass QR code" defaultSize="xl" />
      <div>
        <p className="font-serif text-xl text-[#3D421F]">{reward.title}</p>
        <p className="text-sm text-black/55">
          {REWARD_KIND_LABELS[reward.kind]}
          {reward.value_label ? ` · ${reward.value_label}` : ""}
        </p>
        <p className="mt-2 font-mono text-lg tracking-[0.18em] text-[#3D421F]">
          {issue.code}
        </p>
        <p className="mt-1 text-xs text-black/45">
          {formatIssueStatus(issue.status)} · Valid until {expiry}
        </p>
      </div>
    </Card>
  );
}
