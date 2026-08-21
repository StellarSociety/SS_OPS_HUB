"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createMobileLanHost } from "@/lib/actions/mobile-lan-host";

const LAN_HOST_STORAGE_KEY = "ss-ops-mobile-lan-host";

function displayUrl(url: string) {
  return url.replace(/^https?:\/\//, "");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(field);
      return ok;
    } catch {
      return false;
    }
  }
}

export function MobileLanHostButton({
  previewPath,
}: {
  previewPath: string;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [lanEnabled, setLanEnabled] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setViewUrl(`${window.location.origin}${previewPath}`);
  }, [previewPath]);

  useEffect(() => {
    const stored = window.localStorage.getItem(LAN_HOST_STORAGE_KEY);
    if (!stored) return;
    setUrl(stored);
    setLanEnabled(true);
  }, []);

  useEffect(() => {
    if (!lanEnabled) return;
    startTransition(async () => {
      const result = await createMobileLanHost();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.url);
      window.localStorage.setItem(LAN_HOST_STORAGE_KEY, result.url);
      setError(null);
    });
  }, [lanEnabled, pathname]);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createMobileLanHost();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.url);
      setLanEnabled(true);
      window.localStorage.setItem(LAN_HOST_STORAGE_KEY, result.url);
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex h-12 items-center gap-2 rounded-xl border border-black/5 bg-white/60 px-2 shadow-sm backdrop-blur-xl">
        <UrlOmnibox url={viewUrl} />
        {lanEnabled ? (
          <UrlOmnibox url={lanPreviewUrl(url, previewPath)} compact />
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={handleClick}
          disabled={pending}
          className="shrink-0"
        >
          {pending ? "Setting host…" : "Set Mobile Local Host"}
        </Button>
      </div>
      {error ? (
        <p className="text-right text-sm text-red-700">{error}</p>
      ) : null}
    </div>
  );
}

function lanPreviewUrl(hostUrl: string | null, previewPath: string): string | null {
  if (!hostUrl) return null;
  try {
    const next = new URL(hostUrl);
    const path = new URL(previewPath, "http://ss.invalid");
    next.pathname = path.pathname;
    next.search = path.search;
    next.hash = "";
    return next.toString();
  } catch {
    return hostUrl;
  }
}

function UrlOmnibox({
  url,
  compact = false,
}: {
  url: string | null;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!url}
      title={url ? `Copy ${url}` : undefined}
      aria-label={url ? `Copy ${url}` : "Address"}
      className={
        compact
          ? "flex h-8 w-[22rem] max-w-[min(100%,22rem)] shrink-0 cursor-pointer items-center gap-2 rounded-full bg-black/[0.06] px-3 text-left hover:bg-black/[0.09]"
          : "flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full bg-black/[0.06] px-3 text-left hover:bg-black/[0.09]"
      }
    >
      <Lock
        className="h-3.5 w-3.5 shrink-0 text-black/40"
        strokeWidth={2}
        aria-hidden
      />
      <span className="min-w-0 truncate font-mono text-[13px] text-[#3D421F]">
        {copied ? "Copied" : url ? displayUrl(url) : " "}
      </span>
    </button>
  );
}
