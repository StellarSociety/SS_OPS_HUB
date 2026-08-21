"use client";

import { useState } from "react";
import { PWA_INSTALL_QR_SRC, PWA_INSTALL_URL } from "@/lib/pwa/constants";

export function DesktopInstallPanel() {
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
      <p className="text-base leading-6 text-[#3D421F]/80">
        SS OPS HUB is designed to be installed on your mobile device.
      </p>
      <div className="mx-auto w-fit rounded-3xl bg-white/70 p-4 shadow-sm ring-1 ring-[#3D421F]/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PWA_INSTALL_QR_SRC}
          alt="QR code for the SS OPS HUB install page"
          width={192}
          height={192}
          className="size-48"
        />
      </div>
      <p className="text-sm text-[#3D421F]/70">
        Scan this code on your phone, or copy the install link.
      </p>
      <div className="flex flex-col items-center gap-2">
        <code className="break-all rounded-lg bg-white/70 px-3 py-2 text-sm text-[#3D421F] ring-1 ring-[#3D421F]/10">
          {PWA_INSTALL_URL}
        </code>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="text-sm font-medium text-[#818a40] underline-offset-2 hover:underline"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
