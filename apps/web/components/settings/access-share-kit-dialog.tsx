"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  MessageCircle,
  Monitor,
  Share2,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_APP_NAME } from "@/lib/group/branding";
import { PWA_INSTALL_QR_SRC } from "@/lib/pwa/constants";

export type ShareKit = "web" | "mobile";

export type ShareCredentials = {
  email: string;
  password: string;
  loginUrl: string;
};

/** Install and mobile sign-in links live on the same origin as the login URL. */
function appOrigin(loginUrl: string): string {
  try {
    return new URL(loginUrl).origin;
  } catch {
    return loginUrl.replace(/\/login\/?$/, "");
  }
}

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

export function buildShareKit(
  kit: ShareKit,
  credentials: ShareCredentials,
  recipientName?: string | null,
) {
  const origin = appOrigin(credentials.loginUrl);
  const greeting = firstName(recipientName)
    ? `Hi ${firstName(recipientName)},`
    : "Hi,";

  if (kit === "web") {
    const links = [{ label: "Login link", value: credentials.loginUrl }];
    const message = [
      `${DEFAULT_APP_NAME} — Web app access`,
      "",
      greeting,
      `Your ${DEFAULT_APP_NAME} account is ready. Sign in from a laptop or desktop browser (Chrome, Safari or Edge):`,
      "",
      `Link: ${credentials.loginUrl}`,
      `Username: ${credentials.email}`,
      `Password: ${credentials.password}`,
      "",
      "Please keep these details private.",
    ].join("\n");
    return { links, message };
  }

  const installUrl = `${origin}/install`;
  const mobileLoginUrl = `${origin}/m/login`;
  const links = [
    { label: "Install link", value: installUrl },
    { label: "Mobile login", value: mobileLoginUrl },
  ];
  const message = [
    `${DEFAULT_APP_NAME} — Mobile app install kit`,
    "",
    greeting,
    `Install the ${DEFAULT_APP_NAME} staff app on your phone:`,
    "",
    `1. Open this link on your phone: ${installUrl}`,
    "",
    "2. Add it to your Home Screen:",
    "• iPhone: open the link in Safari → tap Share (square with arrow) → “Add to Home Screen” → Add",
    "• Android: open the link in Chrome → tap “Install” (or menu ⋮ → “Install app”)",
    "",
    `3. Open ${DEFAULT_APP_NAME} from your Home Screen and sign in:`,
    `Username: ${credentials.email}`,
    `Password: ${credentials.password}`,
    "",
    `If the app is already installed, sign in here: ${mobileLoginUrl}`,
    "",
    "Please keep these details private.",
  ].join("\n");
  return { links, message };
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      // clipboard unavailable
    }
  }
  return { copied, copy };
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-black/50">{label}</span>
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 truncate rounded-md border border-black/10 bg-white px-2 font-mono text-xs text-[#3D421F]"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function AccessShareKitDialog({
  kit,
  credentials,
  recipientName,
  onClose,
}: {
  kit: ShareKit;
  credentials: ShareCredentials;
  recipientName?: string | null;
  onClose: () => void;
}) {
  const { copied, copy } = useCopied();
  const { links, message } = buildShareKit(kit, credentials, recipientName);
  const isMobile = kit === "mobile";
  const title = isMobile ? "Mobile app install kit" : "Web app access";
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-share-kit-title"
        className="flex max-h-[min(92dvh,46rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--venue-secondary,#F0F3DD)] text-[var(--venue-primary,#818a40)]">
              {isMobile ? (
                <Smartphone className="size-4" />
              ) : (
                <Monitor className="size-4" />
              )}
            </span>
            <div>
              <h3
                id="access-share-kit-title"
                className="font-serif text-lg text-[#3D421F]"
              >
                {title}
              </h3>
              <p className="mt-0.5 text-sm text-black/50">
                {isMobile
                  ? "Send this to the staff member to install the app on their phone."
                  : "Send this to the staff member to sign in from a computer."}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              {links.map((link) => (
                <CopyField
                  key={link.label}
                  label={link.label}
                  value={link.value}
                  copied={copied === link.label}
                  onCopy={() => void copy(link.label, link.value)}
                />
              ))}
              <CopyField
                label="Username"
                value={credentials.email}
                copied={copied === "username"}
                onCopy={() => void copy("username", credentials.email)}
              />
              <CopyField
                label="Password"
                value={credentials.password}
                copied={copied === "password"}
                onCopy={() => void copy("password", credentials.password)}
              />
            </div>
            {isMobile ? (
              <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
                {/* eslint-disable-next-line @next/next/no-img-element -- static QR asset */}
                <img
                  src={PWA_INSTALL_QR_SRC}
                  alt="QR code for the install page"
                  className="size-28 rounded-md border border-black/10 bg-white p-1"
                />
                <span className="text-[10px] text-black/45">Scan to install</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-black/55">
              Message to share
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-black/10 bg-black/[0.02] p-3 font-sans text-xs leading-relaxed text-[#3D421F]">
              {message}
            </pre>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-black/8 px-5 py-3">
          {canNativeShare ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.share({ title, text: message }).catch(() => {});
              }}
            >
              <Share2 className="h-4 w-4" /> Share…
            </Button>
          ) : null}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--venue-secondary,#F0F3DD)] px-3 text-sm font-medium text-[#3D421F] transition hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
          <Button
            type="button"
            size="sm"
            onClick={() => void copy("message", message)}
          >
            {copied === "message" ? (
              <>
                <Check className="h-4 w-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy message
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
