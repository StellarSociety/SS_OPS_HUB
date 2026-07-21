"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

type PersistenceReport = {
  ok?: boolean;
  error?: string;
  userId?: string | null;
  venueSlug?: string | null;
  env?: {
    hasSupabaseUrl: boolean;
    hasAnonKey: boolean;
    hasServiceRoleKey: boolean;
  };
  serviceClient?: { ok: boolean; error: string | null };
  scope?: Record<string, string | null>;
};

export function PersistenceDiagnosticPanel() {
  const [report, setReport] = useState<PersistenceReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function runCheck() {
    setLoading(true);
    setReport(null);
    try {
      const res = await fetch("/api/health/persistence", {
        credentials: "include",
      });
      const json = (await res.json()) as PersistenceReport;
      setReport(json);
    } catch {
      setReport({ error: "Request failed — are you signed in?" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Cloud save diagnostic</h2>
        <p className="mt-1 text-sm text-black/55">
          Run this on production while logged in (open HR from a venue URL, e.g.{" "}
          <code className="text-xs">/venue/orilla/…</code>). No secrets are shown.
        </p>
      </div>
      <button
        type="button"
        onClick={runCheck}
        disabled={loading}
        className="inline-flex h-10 items-center rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Checking…" : "Run check"}
      </button>
      {report ? (
        <pre className="max-h-96 overflow-auto rounded-md bg-black/5 p-3 text-xs text-[#3D421F]">
          {JSON.stringify(report, null, 2)}
        </pre>
      ) : null}
    </Card>
  );
}
