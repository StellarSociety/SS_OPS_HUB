"use client";

import { useState } from "react";
import { DEFAULT_APP_NAME } from "@/lib/group/branding";
import { PWA_INSTALL_QR_SRC, PWA_INSTALL_URL } from "@/lib/pwa/constants";

export function DesktopInstallPanel({
  appName = DEFAULT_APP_NAME,
}: {
  appName?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(PWA_INSTALL_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto w-fit rounded-3xl bg-neutral-800 p-3 ring-1 ring-white/15">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PWA_INSTALL_QR_SRC}
          alt={`QR code for the ${appName} install page`}
          width={192}
          height={192}
          className="size-48 rounded-xl"
        />
      </div>
      <p className="text-sm text-white/60">
        Scan this code on your phone, or copy the install link.
      </p>
      <div className="flex flex-col items-center gap-2">
        <code className="break-all rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white ring-1 ring-white/15">
          {PWA_INSTALL_URL}
        </code>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="text-sm font-medium text-neutral-300 underline-offset-2 hover:text-white hover:underline"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
