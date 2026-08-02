"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { HardDrive, Link2 } from "lucide-react";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  exchangeWorkDriveGrantCode,
  saveWorkDriveSettings,
  testWorkDriveConnection,
} from "@/lib/actions/hr-workdrive";
import type {
  HrWorkDriveDocSubfolder,
  HrWorkDrivePublicSettings,
  ZohoWorkDriveRegion,
} from "@/lib/hr/types";
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

function SaveDriveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save Drive Setup"}
    </Button>
  );
}

function formatVerified(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    // Fixed locale so SSR and client hydrate the same string.
    return new Date(iso).toLocaleString("en-AE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: HrWorkDrivePublicSettings["connectionStatus"]) {
  if (status === "connected") {
    return "bg-emerald-50 text-emerald-800";
  }
  if (status === "error") {
    return "bg-amber-50 text-amber-900";
  }
  return "bg-black/5 text-black/50";
}

export function WorkDriveSetupPanel({
  settings,
}: {
  settings: HrWorkDrivePublicSettings;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [region, setRegion] = useState<ZohoWorkDriveRegion>(settings.region);
  const [clientId, setClientId] = useState(settings.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [grantCode, setGrantCode] = useState("");
  const [hasClientSecret, setHasClientSecret] = useState(
    settings.hasClientSecret,
  );
  const [hasRefreshToken, setHasRefreshToken] = useState(
    settings.hasRefreshToken,
  );
  const [teamFolderName, setTeamFolderName] = useState(settings.teamFolderName);
  const [teamFolderId, setTeamFolderId] = useState(settings.teamFolderId);
  const [hrFolderName, setHrFolderName] = useState(settings.hrFolderName);
  const [hrFolderId, setHrFolderId] = useState(settings.hrFolderId);
  const [employeeDocsFolderId, setEmployeeDocsFolderId] = useState(
    settings.employeeDocsFolderId,
  );
  const [employeeFolderTemplate, setEmployeeFolderTemplate] = useState(
    settings.employeeFolderTemplate,
  );
  const [fileNameTemplate, setFileNameTemplate] = useState(
    settings.fileNameTemplate,
  );
  const [autoCreateFolders, setAutoCreateFolders] = useState(
    settings.autoCreateFolders,
  );
  const [docSubfolders, setDocSubfolders] = useState<HrWorkDriveDocSubfolder[]>(
    settings.docSubfolders,
  );

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(
    settings.lastError ?? null,
  );
  const [connectionStatus, setConnectionStatus] = useState(
    settings.connectionStatus,
  );
  const [lastVerifiedAt, setLastVerifiedAt] = useState(settings.lastVerifiedAt);
  const [testPending, startTestTransition] = useTransition();
  const [exchangePending, startExchangeTransition] = useTransition();

  const watch = useMemo(
    () =>
      [
        String(enabled),
        region,
        clientId,
        clientSecret,
        refreshToken,
        teamFolderName,
        teamFolderId,
        hrFolderName,
        hrFolderId,
        employeeDocsFolderId,
        employeeFolderTemplate,
        fileNameTemplate,
        String(autoCreateFolders),
        JSON.stringify(docSubfolders),
      ].join("|"),
    [
      enabled,
      region,
      clientId,
      clientSecret,
      refreshToken,
      teamFolderName,
      teamFolderId,
      hrFolderName,
      hrFolderId,
      employeeDocsFolderId,
      employeeFolderTemplate,
      fileNameTemplate,
      autoCreateFolders,
      docSubfolders,
    ],
  );

  function updateDoc(
    kind: HrWorkDriveDocSubfolder["kind"],
    patch: Partial<HrWorkDriveDocSubfolder>,
  ) {
    setDocSubfolders((rows) =>
      rows.map((row) => (row.kind === kind ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-serif text-lg text-[#3D421F]">
              <HardDrive className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              Zoho WorkDrive
            </h3>
            <p className="mt-1 text-sm text-black/55">
              Staff documents upload to WorkDrive (not Supabase Storage). Root:{" "}
              <span className="font-medium text-[#3D421F]">
                {teamFolderName || "HUMAN RESOURCES"}
              </span>
              {" → "}
              <span className="font-medium text-[#3D421F]">
                Employee Documents
              </span>
              {" → employee folder → document type. Profile photos are archived"}
              {" in WorkDrive too; the app still serves the cropped WebP from"}
              {" the existing photo URL so avatars stay fast."}
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
          const result = await saveWorkDriveSettings(formData);
          if (!result.ok) {
            setStatusError(result.error);
            return;
          }
          if (clientSecret.trim()) setHasClientSecret(true);
          if (refreshToken.trim()) setHasRefreshToken(true);
          setClientSecret("");
          setRefreshToken("");
          setStatusMessage("Drive Setup saved.");
        }}
        className="space-y-4"
      >
        <Card className="space-y-4 p-5">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
              Connection
            </h4>
            <p className="mt-1 text-xs text-black/45">
              OAuth client from Zoho API Console. Secrets are encrypted at rest
              and never shown again after save.
            </p>
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
                  disabled={exchangePending || !grantCode.trim()}
                  onClick={() => {
                    startExchangeTransition(async () => {
                      setStatusMessage(null);
                      setStatusError(null);
                      const fd = new FormData();
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
                    });
                  }}
                >
                  {exchangePending ? "Exchanging…" : "Exchange code"}
                </Button>
              </div>
              <p className="text-[11px] text-black/40">
                Scopes: WorkDrive.files.CREATE, UPDATE, READ +
                WorkDrive.teamfolders.READ. Code expires in ~3 minutes.
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
              Storage location
            </h4>
            <p className="mt-1 text-xs text-black/45">
              Live model: Team Folder{" "}
              <span className="font-medium">HUMAN RESOURCES</span> is the HR
              root (same ID for team + HR). New per-employee folders are created
              under <span className="font-medium">Employee Documents</span> —
              existing flat person-PDFs there are left alone.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team_folder_name">Team folder name</Label>
              <Input
                id="team_folder_name"
                name="team_folder_name"
                value={teamFolderName}
                onChange={(e) => setTeamFolderName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team_folder_id">Team folder ID</Label>
              <Input
                id="team_folder_id"
                name="team_folder_id"
                value={teamFolderId}
                onChange={(e) => setTeamFolderId(e.target.value)}
                placeholder="From WorkDrive URL …/ws/<id>"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr_folder_name">HR folder name</Label>
              <Input
                id="hr_folder_name"
                name="hr_folder_name"
                value={hrFolderName}
                onChange={(e) => setHrFolderName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr_folder_id">Human Resources folder ID</Label>
              <Input
                id="hr_folder_id"
                name="hr_folder_id"
                value={hrFolderId}
                onChange={(e) => setHrFolderId(e.target.value)}
                placeholder="Same as team folder ID in live account"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="employee_docs_folder_id">
                Employee Documents folder ID (working parent)
              </Label>
              <Input
                id="employee_docs_folder_id"
                name="employee_docs_folder_id"
                value={employeeDocsFolderId}
                onChange={(e) => setEmployeeDocsFolderId(e.target.value)}
                placeholder="From WorkDrive URL …/folders/<id>"
              />
              <p className="text-[11px] text-black/40">
                Swappable constant — per-employee folders are created here. Do
                not migrate existing flat PDFs in this folder.
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
              Folders &amp; file naming
            </h4>
            <p className="mt-1 text-xs text-black/45">
              Employee folders are created under Employee Documents. Document
              types become subfolders. Files are renamed on upload using the
              template.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              name="auto_create_folders"
              value="true"
              checked={autoCreateFolders}
              onChange={(e) => setAutoCreateFolders(e.target.checked)}
              className="rounded border-black/20"
            />
            Auto-create employee and document-type folders when missing
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="employee_folder_template">
                Employee folder name template
              </Label>
              <Input
                id="employee_folder_template"
                name="employee_folder_template"
                value={employeeFolderTemplate}
                onChange={(e) => setEmployeeFolderTemplate(e.target.value)}
              />
              <p className="text-[11px] text-black/40">
                Tokens: {"{emp_no}"} {"{full_name}"} {"{first_name}"}{" "}
                {"{last_name}"}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="file_name_template">File name template</Label>
              <Input
                id="file_name_template"
                name="file_name_template"
                value={fileNameTemplate}
                onChange={(e) => setFileNameTemplate(e.target.value)}
              />
              <p className="text-[11px] text-black/40">
                Tokens: {"{doc_label}"} {"{doc_kind}"} {"{emp_no}"}{" "}
                {"{full_name}"} {"{yyyy-MM-dd}"} {"{yyyy}"} {"{MM}"} {"{dd}"}{" "}
                {"{original_name}"} — extension kept from the upload.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-black/8">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[0.03] text-[11px] uppercase tracking-wide text-black/45">
                <tr>
                  <th className="px-3 py-2 font-medium">Active</th>
                  <th className="px-3 py-2 font-medium">Document</th>
                  <th className="px-3 py-2 font-medium">Subfolder name</th>
                </tr>
              </thead>
              <tbody>
                {docSubfolders.map((row) => (
                  <tr key={row.kind} className="border-t border-black/5">
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        name={`doc_active_${row.kind}`}
                        value="true"
                        checked={row.active}
                        onChange={(e) =>
                          updateDoc(row.kind, { active: e.target.checked })
                        }
                        className="rounded border-black/20"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="hidden"
                        name={`doc_label_${row.kind}`}
                        value={row.label}
                      />
                      <span className="text-[#3D421F]">{row.label}</span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Input
                        name={`doc_folder_${row.kind}`}
                        value={row.folderName}
                        onChange={(e) =>
                          updateDoc(row.kind, { folderName: e.target.value })
                        }
                        className="h-8"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <SaveDriveButton />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testPending}
            onClick={() => {
              startTestTransition(async () => {
                setStatusMessage(null);
                setStatusError(null);
                const result = await testWorkDriveConnection();
                if (!result.ok) {
                  setConnectionStatus("error");
                  setStatusError(result.error);
                  return;
                }
                setConnectionStatus("connected");
                setLastVerifiedAt(new Date().toISOString());
                setStatusMessage(result.message);
              });
            }}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {testPending ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </GuardedSettingsForm>
    </div>
  );
}
