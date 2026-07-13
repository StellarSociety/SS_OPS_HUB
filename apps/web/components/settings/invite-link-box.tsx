"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InviteLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <Link2 className="h-3.5 w-3.5" /> Invite link — share this manually
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 flex-1 truncate rounded-md border border-black/10 bg-white px-2 font-mono text-xs text-black/70"
        />
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
