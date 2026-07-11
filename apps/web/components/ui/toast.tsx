"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App-wide toast standard.
 *
 * One imperative API, one visual host. Use anywhere (client components) via:
 *   toast.saved("Saved to cloud.")            // green  — save confirmations
 *   toast.uploaded("Uploaded to the cloud.")  // blue   — cloud upload confirmations
 *   toast.alert("Check the highlighted rows.") // amber  — warnings / attention (sticky)
 *   toast.error("Couldn't save. Try again.")  // red    — failures (sticky)
 *
 * All toasts render top-left, below the header. Save/upload auto-dismiss after
 * ~4s; alerts and errors stay until dismissed. Every toast has a close button.
 */

export type ToastKind = "saved" | "uploaded" | "alert" | "error";

export type ToastRecord = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  /** ms until auto-dismiss, or null to require manual close */
  durationMs: number | null;
};

type ToastInput =
  | string
  | {
      message: string;
      title?: string;
      /** ms until auto-dismiss; pass null to make it sticky */
      durationMs?: number | null;
    };

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 4;

const KIND_DEFAULTS: Record<ToastKind, { durationMs: number | null }> = {
  saved: { durationMs: AUTO_DISMISS_MS },
  uploaded: { durationMs: AUTO_DISMISS_MS },
  alert: { durationMs: null },
  error: { durationMs: null },
};

// --- store (module singleton, usable from any client component) ---

type Listener = () => void;

let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();
let counter = 0;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

function push(kind: ToastKind, input: ToastInput): string {
  const id = `toast_${Date.now()}_${counter++}`;
  const normalized =
    typeof input === "string" ? { message: input } : input;

  const record: ToastRecord = {
    id,
    kind,
    title: normalized.title,
    message: normalized.message,
    durationMs:
      normalized.durationMs !== undefined
        ? normalized.durationMs
        : KIND_DEFAULTS[kind].durationMs,
  };

  toasts = [record, ...toasts].slice(0, MAX_VISIBLE);
  emit();
  return id;
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function clear() {
  toasts = [];
  emit();
}

export const toast = {
  /** Green — save confirmation. */
  saved: (input: ToastInput) => push("saved", input),
  /** Blue — cloud upload confirmation. */
  uploaded: (input: ToastInput) => push("uploaded", input),
  /** Amber — warning / attention. Stays until dismissed by default. */
  alert: (input: ToastInput) => push("alert", input),
  /** Red — failure. Stays until dismissed by default. */
  error: (input: ToastInput) => push("error", input),
  dismiss,
  clear,
};

// --- presentation ---

const KIND_STYLES: Record<
  ToastKind,
  {
    container: string;
    icon: string;
    Icon: typeof CheckCircle2;
    live: "polite" | "assertive";
    role: "status" | "alert";
  }
> = {
  saved: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "text-emerald-600",
    Icon: CheckCircle2,
    live: "polite",
    role: "status",
  },
  uploaded: {
    container: "border-sky-200 bg-sky-50 text-sky-900",
    icon: "text-sky-600",
    Icon: CloudUpload,
    live: "polite",
    role: "status",
  },
  alert: {
    container: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "text-amber-600",
    Icon: AlertTriangle,
    live: "assertive",
    role: "alert",
  },
  error: {
    container: "border-red-200 bg-red-50 text-red-800",
    icon: "text-red-600",
    Icon: XCircle,
    live: "assertive",
    role: "alert",
  },
};

function ToastItem({ record }: { record: ToastRecord }) {
  const [visible, setVisible] = useState(false);
  const style = KIND_STYLES[record.kind];
  const { Icon } = style;

  const handleClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => dismiss(record.id), 180);
  }, [record.id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (record.durationMs == null) return;
    const timer = window.setTimeout(handleClose, record.durationMs);
    return () => window.clearTimeout(timer);
  }, [record.durationMs, handleClose]);

  return (
    <div
      role={style.role}
      aria-live={style.live}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-black/5 backdrop-blur-sm transition-all duration-200 ease-out",
        style.container,
        visible ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0",
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", style.icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        {record.title ? (
          <p className="text-sm font-semibold leading-tight">{record.title}</p>
        ) : null}
        <p
          className={cn(
            "text-sm leading-snug",
            record.title ? "mt-0.5 opacity-90" : "font-medium",
          )}
        >
          {record.message}
        </p>
      </div>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Toast viewport. Mount once, near the top-left of the content area so toasts
 * appear below the header and never cover the sidebar logo/nav.
 */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => toasts);

  if (items.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none absolute left-4 top-3 z-[100] flex w-[min(360px,calc(100%-2rem))] flex-col gap-2"
    >
      {items.map((record) => (
        <ToastItem key={record.id} record={record} />
      ))}
    </div>
  );
}
