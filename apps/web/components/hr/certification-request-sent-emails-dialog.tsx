"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, Mail, X } from "lucide-react";
import {
  listCertificationRequestEmailSends,
  type CertificationRequestEmailSendRecord,
} from "@/lib/actions/hr-certifications";
import { Button } from "@/components/ui/button";

function formatSendWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CertificationRequestSentEmailsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [sends, setSends] = useState<
    CertificationRequestEmailSendRecord[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    startTransition(async () => {
      const result = await listCertificationRequestEmailSends();
      if (!result.ok) {
        setSends([]);
        setError(result.error);
        return;
      }
      setSends(result.sends);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cert-sent-emails-title"
        className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="cert-sent-emails-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              Sent certification requests
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider emails sent from Certifications → Employees.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {pending && sends === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sent emails…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              {error}
            </p>
          ) : !sends || sends.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 px-4 py-12 text-center text-sm text-black/45">
              No certification request emails have been sent yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {sends.map((send) => (
                <li
                  key={send.id}
                  className="rounded-xl border border-black/10 bg-black/[0.015] px-3.5 py-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--venue-secondary,#F0F3DD)] text-[var(--venue-primary,#818a40)]">
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#3D421F]">
                        {send.empNo
                          ? `${send.empNo} — ${send.employeeName}`
                          : send.employeeName}
                      </p>
                      <p className="mt-0.5 text-xs text-black/50">
                        {formatSendWhen(send.sentAt)}
                        {send.sentBy ? ` · by ${send.sentBy}` : ""}
                      </p>
                      {send.to ? (
                        <p className="mt-1 truncate text-xs text-black/55">
                          To {send.to}
                          {send.providerCompany
                            ? ` · ${send.providerCompany}`
                            : ""}
                        </p>
                      ) : send.providerCompany ? (
                        <p className="mt-1 truncate text-xs text-black/55">
                          {send.providerCompany}
                        </p>
                      ) : null}
                      {send.certificationNames.length > 0 ? (
                        <p className="mt-1 text-xs text-[#3D421F]/70">
                          {send.certificationNames.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
