"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Image as ImageIcon, Link2 } from "lucide-react";
import { fetchChatShared } from "@/lib/actions/connect-chat";
import { formatFileSize, formatPostTimestamp } from "@/lib/connect/format";
import type { ChatShared, SharedItem } from "@/lib/connect/chat-types";
import type { ConnectPerson } from "@/lib/connect/types";
import { cn } from "@/lib/utils";

type Tab = "images" | "documents" | "links";

const TABS: { key: Tab; label: string; icon: typeof ImageIcon }[] = [
  { key: "images", label: "Images", icon: ImageIcon },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "links", label: "Links", icon: Link2 },
];

/** Photos, documents and links shared in the chat, each in its own tab. */
export function ChatSharedSection({
  conversationId,
  refreshKey,
  peopleById,
}: {
  conversationId: string;
  /** Changes when new messages arrive, so the lists stay current. */
  refreshKey: string;
  peopleById: Map<string, ConnectPerson>;
}) {
  const [tab, setTab] = useState<Tab>("images");
  const [shared, setShared] = useState<ChatShared | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchChatShared(conversationId).then((result) => {
      if (cancelled) return;
      if (!result.ok) setError(result.error);
      else setShared(result.shared);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshKey]);

  const items = shared?.[tab] ?? [];

  return (
    <section className="space-y-3 border-t border-black/5 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">Shared</h3>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F0F2E8] p-1" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = shared?.[t.key].length;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium",
                tab === t.key ? "bg-white text-[#2B2F16] shadow-sm" : "text-black/55 hover:text-black/75",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
              {count ? <span className="text-[10px] text-black/40">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !shared ? (
        <p className="py-4 text-center text-sm text-black/45">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-black/45">
          No {tab === "images" ? "images" : tab === "documents" ? "documents" : "links"} shared yet.
        </p>
      ) : tab === "images" ? (
        <ul className="grid grid-cols-3 gap-1">
          {items.map((item) => (
            <li key={item.messageId}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square overflow-hidden rounded-lg bg-black/5"
                title={`${item.name} · ${formatPostTimestamp(item.createdAt)}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={`${item.messageId}-${i}`}>
              <SharedRow item={item} kind={tab} sender={item.senderId ? peopleById.get(item.senderId) : undefined} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SharedRow({
  item,
  kind,
  sender,
}: {
  item: SharedItem;
  kind: "documents" | "links";
  sender: ConnectPerson | undefined;
}) {
  const meta = [sender?.name.split(/\s+/)[0], formatPostTimestamp(item.createdAt)].filter(Boolean).join(" · ");
  if (kind === "links") {
    let host = item.url;
    try {
      host = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      // Keep the raw URL.
    }
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-black/[0.04]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Link2 className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[#2B2F16]">{host}</span>
          <span className="block truncate text-xs text-sky-700">{item.url}</span>
          <span className="block text-[11px] text-black/45">{meta}</span>
        </span>
      </a>
    );
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      download={item.name}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-black/[0.04]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0F2E8] text-[#3D421F]">
        <FileText className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[#2B2F16]">{item.name}</span>
        <span className="block text-[11px] text-black/45">
          {formatFileSize(item.size)} · {meta}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-black/35" aria-hidden />
    </a>
  );
}
