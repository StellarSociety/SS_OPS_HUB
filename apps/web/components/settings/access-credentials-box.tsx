"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function AccessCredentialsBox({ credentials }: { credentials: Credentials }) {
  const [copiedAll, setCopiedAll] = useState(false);

  async function copyAll() {
    const block = [
      "SS Operational Hub — your access",
      `Login: ${credentials.loginUrl}`,
      `Email: ${credentials.email}`,
      `Password: ${credentials.password}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(block);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
          <KeyRound className="h-3.5 w-3.5" /> Account ready — share these with the user
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={copyAll}>
          {copiedAll ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy all
            </>
          )}
        </Button>
      </div>
      <div className="space-y-2">
        <CopyRow label="Login URL" value={credentials.loginUrl} />
        <CopyRow label="Email" value={credentials.email} />
        <CopyRow label="Password" value={credentials.password} />
      </div>
      <p className="text-[11px] text-emerald-700/80">
        The password is shown only once here. Copy it now — you can reset it later
        from this page.
      </p>
    </div>
  );
}
