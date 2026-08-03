"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Link2 } from "lucide-react";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  exchangeWorkDriveGrantCode,
  saveWorkDriveConnection,
  testWorkDriveConnection,
} from "@/lib/actions/hr-workdrive";
import type {
  HrWorkDriveConnectionPublic,
  ZohoWorkDriveRegion,
} from "@/lib/hr/types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

const REGION_OPTIONS: { value: ZohoWorkDriveRegion; label: string }[] = [
  { value: "com", label: "US (.com)" },
  { value: "eu", label: "EU (.eu)" },
  { value: "in", label: "India (.in)" },
  { value: "com.au", label: "Australia (.com.au)" },
  { value: "uk", label: "UK (.uk)" },
  { value: "jp", label: "Japan (.jp)" },
  { value: "ca", label: "Canada (.ca)" },
  { value: "sa", label: "Saudi Arabia (.sa)" },
];

function SaveConnectionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function formatVerified(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-AE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function statusBadge(
  status: HrWorkDriveConnectionPublic["connectionStatus"],
) {
  if (status === "connected") {
    return "bg-emerald-50 text-emerald-800";
  }
  if (status === "error") {
    return "bg-amber-50 text-amber-900";
  }
  return "bg-black/5 text-black/50";
}

export function WorkDriveConnectionPanel({
  connection,
  mode = "edit",
}: {
  connection: HrWorkDriveConnectionPublic;
  mode?: "edit" | "add";
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const connectionId = mode === "add" ? null : connection.id;

  const [enabled, setEnabled] = useState(connection.enabled);
  const [label, setLabel] = useState(connection.label || "ZOHO WorkDrive");
  const [region, setRegion] = useState<ZohoWorkDriveRegion>(connection.region);
  const [clientId, setClientId] = useState(connection.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [grantCode, setGrantCode] = useState("");
  const [hasClientSecret, setHasClientSecret] = useState(
    connection.hasClientSecret,
  );
  const [hasRefreshToken, setHasRefreshToken] = useState(
    connection.hasRefreshToken,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(
    connection.lastError ?? null,
  );
  const [connectionStatus, setConnectionStatus] = useState(
    connection.connectionStatus,
  );
  const [lastVerifiedAt, setLastVerifiedAt] = useState(
    connection.lastVerifiedAt,
  );
  const [testPending, startTestTransition] = useTransition();
  const [exchangePending, startExchangeTransition] = useTransition();

  const watch = useMemo(
    () =>
      [
        String(enabled),
        label,
        region,
        clientId,
        clientSecret,
        refreshToken,
      ].join("|"),
    [enabled, label, region, clientId, clientSecret, refreshToken],
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-lg text-[#3D421F]">
              {mode === "add" ? "Add Zoho connection" : "Connection"}
            </h3>
            <p className="mt-1 text-sm text-black/55">
              OAuth client from Zoho API Console. Secrets are encrypted at rest
              and never shown again after save.
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              statusBadge(connectionStatus),
            )}
          >
            {connectionStatus}
          </span>
        </div>
        {formatVerified(lastVerifiedAt) ? (
          <p className="text-xs text-black/40">
            Last verified {formatVerified(lastVerifiedAt)}
          </p>
        ) : null}
        {statusError ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {statusError}
          </p>
        ) : null}
        {statusMessage ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            {statusMessage}
          </p>
        ) : null}
      </Card>

      <GuardedSettingsForm
        watch={watch}
        action={async (formData) => {
          setStatusMessage(null);
          setStatusError(null);
          if (connectionId) formData.set("connection_id", connectionId);
          const result = await saveWorkDriveConnection(formData);
          if (!result.ok) {
            setStatusError(result.error);
            return;
          }
          if (clientSecret.trim()) setHasClientSecret(true);
          if (refreshToken.trim()) setHasRefreshToken(true);
          setClientSecret("");
          setRefreshToken("");
          setStatusMessage("Connection saved.");
          if (mode === "add") {
            router.push(
              toScopedHref(
                `/settings/drive-config/${result.connectionId}/connection`,
                scope,
                slug,
              ),
            );
            router.refresh();
            return;
          }
          router.refresh();
        }}
        className="space-y-4"
      >
        {connectionId ? (
          <input type="hidden" name="connection_id" value={connectionId} />
        ) : null}

        <Card className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="connection_label">Connection name</Label>
            <Input
              id="connection_label"
              name="connection_label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ZOHO WorkDrive"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-black/20"
            />
            Enable WorkDrive uploads for this venue
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="region">Zoho data center</Label>
              <select
                id="region"
                name="region"
                value={region}
                onChange={(e) =>
                  setRegion(e.target.value as ZohoWorkDriveRegion)
                }
                className={selectClass}
              >
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                name="client_id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_secret">
                Client secret
                {hasClientSecret ? " (leave blank to keep)" : ""}
              </Label>
              <Input
                id="client_secret"
                name="client_secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                autoComplete="new-password"
                placeholder={hasClientSecret ? "••••••••" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refresh_token">
                Refresh token
                {hasRefreshToken ? " (leave blank to keep)" : ""}
              </Label>
              <Input
                id="refresh_token"
                name="refresh_token"
                type="password"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                autoComplete="new-password"
                placeholder={hasRefreshToken ? "••••••••" : ""}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="grant_code">
                Self Client grant code (one-time exchange)
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="grant_code"
                  name="grant_code"
                  value={grantCode}
                  onChange={(e) => setGrantCode(e.target.value)}
                  autoComplete="off"
                  placeholder="Paste code from api-console.zoho.com → Generate Code"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    exchangePending || !grantCode.trim() || !connectionId
                  }
                  onClick={() => {
                    if (!connectionId) return;
                    startExchangeTransition(async () => {
                      setStatusMessage(null);
                      setStatusError(null);
                      const fd = new FormData();
                      fd.set("connection_id", connectionId);
                      fd.set("region", region);
                      fd.set("client_id", clientId);
                      if (clientSecret.trim()) {
                        fd.set("client_secret", clientSecret);
                      }
                      fd.set("grant_code", grantCode.trim());
                      const result = await exchangeWorkDriveGrantCode(fd);
                      if (!result.ok) {
                        setStatusError(result.error);
                        return;
                      }
                      setGrantCode("");
                      setHasRefreshToken(true);
                      if (clientSecret.trim()) setHasClientSecret(true);
                      setClientSecret("");
                      setStatusMessage(result.message);
                      router.refresh();
                    });
                  }}
                >
                  {exchangePending ? "Exchanging…" : "Exchange code"}
                </Button>
              </div>
              <p className="text-[11px] text-black/40">
                {connectionId
                  ? "Scopes: WorkDrive.files.ALL, WorkDrive.teamfolders.READ (files.ALL is required for preview/download). Code expires in ~3 minutes."
                  : "Save the connection first, then exchange a grant code."}
              </p>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {connectionId ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={testPending}
              className="border border-[#3D421F]/15"
              onClick={() => {
                startTestTransition(async () => {
                  setStatusMessage(null);
                  setStatusError(null);
                  const fd = new FormData();
                  fd.set("connection_id", connectionId);
                  const result = await testWorkDriveConnection(fd);
                  if (!result.ok) {
                    setConnectionStatus("error");
                    setStatusError(result.error);
                    return;
                  }
                  setConnectionStatus("connected");
                  setLastVerifiedAt(new Date().toISOString());
                  setStatusMessage(result.message);
                  router.refresh();
                });
              }}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {testPending ? "Testing…" : "Test connection"}
            </Button>
          ) : null}
          <SaveConnectionButton
            label={mode === "add" ? "Create connection" : "Save connection"}
          />
        </div>
      </GuardedSettingsForm>
    </div>
  );
}
