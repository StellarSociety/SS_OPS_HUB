"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { EmailTransportSettingsCard } from "@/components/hr/email-transport-settings-card";
import { Button } from "@/components/ui/button";
import {
  EMAIL_TRANSPORT_PRESETS,
  EMPTY_HR_EMAIL_TRANSPORT_SETTINGS,
  type HrEmailConnectionPublic,
  type HrEmailTransportPublicSettings,
} from "@/lib/hr/types";

type View =
  | { kind: "list" }
  | { kind: "edit"; connection: HrEmailConnectionPublic }
  | { kind: "add" };

function statusLabel(connection: HrEmailConnectionPublic): {
  text: string;
  className: string;
} {
  if (connection.lastError) {
    return {
      text: "Error",
      className: "bg-red-50 text-red-800",
    };
  }
  if (connection.lastVerifiedAt) {
    return {
      text: "Verified",
      className: "bg-emerald-50 text-emerald-800",
    };
  }
  return {
    text: "Not verified",
    className: "bg-black/5 text-black/55",
  };
}

function toPublicSettings(
  connection: HrEmailConnectionPublic,
): HrEmailTransportPublicSettings {
  const { id: _id, label: _label, isDefault: _d, ...settings } = connection;
  return settings;
}

function emptyPublicSettings(): HrEmailTransportPublicSettings {
  const { passwordEncrypted: _p, ...rest } = EMPTY_HR_EMAIL_TRANSPORT_SETTINGS;
  return { ...rest, hasPassword: false };
}

export function EmailConfigPanel({
  connections: initialConnections,
}: {
  connections: HrEmailConnectionPublic[];
}) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [view, setView] = useState<View>({ kind: "list" });

  useEffect(() => {
    setConnections(initialConnections);
  }, [initialConnections]);

  function handleSaved() {
    setView({ kind: "list" });
    router.refresh();
  }

  if (view.kind === "edit") {
    return (
      <EmailTransportSettingsCard
        key={view.connection.id}
        settings={toPublicSettings(view.connection)}
        connectionId={view.connection.id}
        mode="edit"
        onCancel={() => setView({ kind: "list" })}
        onSaved={handleSaved}
      />
    );
  }

  if (view.kind === "add") {
    return (
      <EmailTransportSettingsCard
        key="new"
        settings={emptyPublicSettings()}
        mode="add"
        onCancel={() => setView({ kind: "list" })}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">
            Connected emails
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Mailboxes used to send venue email. The default connection is used
            for delivery until per-template selection is available.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setView({ kind: "add" })}
        >
          <Plus className="size-4" aria-hidden />
          Add connection
        </Button>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-6 py-10 text-center">
          <p className="text-sm text-black/55">
            No email connections yet. Add one to start sending from this venue.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-4"
            onClick={() => setView({ kind: "add" })}
          >
            <Plus className="size-4" aria-hidden />
            Add connection
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[22%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-3">From email</th>
                <th className="px-4 py-3">From name</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => {
                const status = statusLabel(connection);
                const providerLabel =
                  EMAIL_TRANSPORT_PRESETS[connection.provider]?.label ??
                  connection.provider;
                return (
                  <tr
                    key={connection.id}
                    className="border-b border-black/5 last:border-0 hover:bg-[var(--venue-secondary)]/30"
                  >
                    <td className="truncate px-4 py-3 font-medium text-[#3D421F]">
                      {connection.smtp.fromEmail ||
                        connection.smtp.username ||
                        "—"}
                      {connection.isDefault ? (
                        <span className="ml-2 inline-flex rounded-full bg-[var(--venue-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3D421F]">
                          Default
                        </span>
                      ) : null}
                    </td>
                    <td className="truncate px-4 py-3 text-black/70">
                      {connection.smtp.fromName || "—"}
                    </td>
                    <td className="truncate px-4 py-3 text-black/70">
                      {providerLabel}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                      >
                        {status.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#3D421F]"
                        aria-label={`Edit ${connection.smtp.fromEmail || connection.label}`}
                        onClick={() =>
                          setView({ kind: "edit", connection })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
