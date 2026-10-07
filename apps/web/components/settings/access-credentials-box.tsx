"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Monitor,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import {
  AccessShareKitDialog,
  type ShareKit,
} from "@/components/settings/access-share-kit-dialog";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button, buttonVariants } from "@/components/ui/button";

type Credentials = {
  email: string;
  password: string;
  loginUrl: string;
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-black/50">{label}</span>
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 flex-1 truncate rounded-md border border-black/10 bg-white px-2 font-mono text-xs text-[#3D421F]"
      />
      <Button type="button" size="sm" variant="ghost" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function AccessCredentialsBox({
  credentials,
  manageHref,
  recipientName,
}: {
  credentials: Credentials;
  /** Unscoped path to the user's management page (access + credentials). */
  manageHref?: string;
  /** Used to greet the staff member in the share messages. */
  recipientName?: string | null;
}) {
  const [shareKit, setShareKit] = useState<ShareKit | null>(null);

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
          <KeyRound className="h-3.5 w-3.5" /> Account ready — share these with the user
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShareKit("web")}
          >
            <Monitor className="h-4 w-4" /> Web app access
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShareKit("mobile")}
          >
            <Smartphone className="h-4 w-4" /> Mobile app kit
          </Button>
          {manageHref ? (
            <ScopedLink
              href={manageHref}
              className={buttonVariants({ size: "sm" })}
            >
              <SlidersHorizontal className="h-4 w-4" /> Manage access
            </ScopedLink>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <CopyRow label="Login URL" value={credentials.loginUrl} />
        <CopyRow label="Email" value={credentials.email} />
        <CopyRow label="Password" value={credentials.password} />
      </div>
      <p className="text-[11px] text-emerald-700/80">
        Use Web app access or Mobile app kit for a ready-to-send message with
        links and sign-in details. You can also view the password later from
        this page under View password.
      </p>
      {shareKit ? (
        <AccessShareKitDialog
          kit={shareKit}
          credentials={credentials}
          recipientName={recipientName}
          onClose={() => setShareKit(null)}
        />
      ) : null}
    </div>
  );
}
