"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ChevronDown, Check, Copy, Folder, Plus, RefreshCw, Trash2 } from "lucide-react";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  saveWorkDriveFolder,
  syncWorkDriveFolderNamesFromZoho,
} from "@/lib/actions/hr-workdrive";
import type {
  HrWorkDriveDocFileSlot,
  HrWorkDriveDocSubfolder,
  HrWorkDriveExtraFolder,
  HrWorkDriveFolderPublic,
} from "@/lib/hr/types";
import { DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS } from "@/lib/hr/types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { cn } from "@/lib/utils";

const FILE_NAME_TOKENS: { token: string; label: string }[] = [
  { token: "{first_name}", label: "Employee first name" },
  { token: "{last_name}", label: "Employee last name" },
  { token: "{doc_name}", label: "Document name" },
  { token: "{doc_expiry}", label: "Doc expiry (dd-mm-yy)" },
  { token: "{emp_no}", label: "Employee number" },
  { token: "{slot_label}", label: "File part (e.g. Front)" },
  { token: "{yyyy-MM-dd}", label: "Upload date" },
  { token: "{original_name}", label: "Original file name" },
];

function FileNameTokenList() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      window.setTimeout(() => {
        setCopiedToken((current) => (current === token ? null : current));
      }, 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {FILE_NAME_TOKENS.map((row) => {
        const copied = copiedToken === row.token;
        return (
          <li key={row.token}>
            <button
              type="button"
              onClick={() => void copyToken(row.token)}
              title={`Copy ${row.token}`}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors",
                "hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary)]/30",
              )}
            >
              <code className="inline-flex shrink-0 items-center gap-1 rounded bg-black/[0.05] px-1 py-0.5 font-mono text-[10px] text-[#3D421F]">
                {row.token}
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-700" aria-hidden />
                ) : (
                  <Copy className="h-3 w-3 text-black/30" aria-hidden />
                )}
              </code>
              <span className="min-w-0 flex-1 text-black/45">
                {copied ? "Copied" : row.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function newDocFileSlot(): HrWorkDriveDocFileSlot {
  return {
    id: crypto.randomUUID().slice(0, 8),
    label: "File",
    fileNameTemplate: `{doc_name}_{first_name}_{last_name}_{doc_expiry}`,
  };
}

/** Merge saved rows with the full default employment/personal doc catalog. */
function mergeDocSubfoldersForUi(
  saved: HrWorkDriveDocSubfolder[] | undefined,
  legacyFileNameTemplate?: string,
): HrWorkDriveDocSubfolder[] {
  const byKind = new Map((saved ?? []).map((row) => [row.kind, row]));
  return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((defaults) => {
    const override = byKind.get(defaults.kind);
    if (!override) {
      return {
        ...defaults,
        fileSlots: defaults.fileSlots.map((slot) => ({ ...slot })),
      };
    }
    const legacySingleSlot =
      override.fileSlots?.length === 1 &&
      defaults.fileSlots.length > 1 &&
      (override.fileSlots[0].id === "default" ||
        override.fileSlots[0].label.trim().toLowerCase() === "file");
    const fileSlots =
      !override.fileSlots?.length || legacySingleSlot
        ? defaults.fileSlots.map((slot) => ({ ...slot }))
        : override.fileSlots.map((slot) => ({
            ...slot,
            fileNameTemplate:
              slot.fileNameTemplate.trim() ||
              legacyFileNameTemplate?.trim() ||
              `{doc_name}_{first_name}_{last_name}_{doc_expiry}`,
          }));
    return {
      kind: defaults.kind,
      folderName: override.folderName.trim() || defaults.folderName,
      label: override.label.trim() || defaults.label,
      active:
        typeof override.active === "boolean" ? override.active : defaults.active,
      fileSlots,
    };
  });
}

function SaveFolderButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function PathSegment({
  label,
  muted,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[14rem] items-center gap-1 truncate",
        muted ? "text-black/40 italic" : "font-medium text-[#3D421F]",
      )}
      title={label}
    >
      <Folder className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      <span className="truncate">{label || "…"}</span>
    </span>
  );
}

function FolderNode({
  depth,
  title,
  hint,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  depth: number;
  title: ReactNode;
  hint?: string;
  children?: ReactNode;
  /** When true, header toggles visibility of children (kept mounted for form fields). */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId();
  const detailsId = collapsible ? `folder-node-${reactId}` : undefined;

  return (
    <div
      className={cn(
        "relative space-y-3",
        depth > 0 && "ml-3 border-l border-black/10 pl-4 sm:ml-4 sm:pl-5",
      )}
    >
      <div className="space-y-1 rounded-lg bg-black/[0.07] px-3 py-2">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-sm font-medium text-[#3D421F] transition-colors hover:text-[var(--venue-primary,#8B9A46)]"
          >
            <Folder
              className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#8B9A46)]"
              aria-hidden
            />
            <span className="min-w-0 flex-1">{title}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-black/40 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-[#3D421F]">
            <Folder
              className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#8B9A46)]"
              aria-hidden
            />
            {title}
          </div>
        )}
        {hint && (!collapsible || open) ? (
          <p className="text-[11px] text-black/40">{hint}</p>
        ) : null}
      </div>
      {children ? (
        <div
          id={detailsId}
          className={cn("space-y-3", collapsible && !open && "hidden")}
          aria-hidden={collapsible ? !open : undefined}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function newExtraFolder(): HrWorkDriveExtraFolder {
  return {
    id: crypto.randomUUID(),
    name: "",
    folderId: "",
  };
}

export function WorkDriveFolderPanel({
  connectionId,
  folder,
  mode = "edit",
}: {
  connectionId: string;
  folder: HrWorkDriveFolderPublic;
  mode?: "edit" | "add";
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();

  const [teamFolderName, setTeamFolderName] = useState(folder.teamFolderName);
  const [teamFolderId, setTeamFolderId] = useState(folder.teamFolderId);
  const [hrFolderName, setHrFolderName] = useState(folder.hrFolderName);
  const [hrFolderId, setHrFolderId] = useState(folder.hrFolderId);
  const [employeeDocsFolderName, setEmployeeDocsFolderName] = useState(
    folder.employeeDocsFolderName || "Employee Documents",
  );
  const [employeeDocsFolderId, setEmployeeDocsFolderId] = useState(
    folder.employeeDocsFolderId,
  );
  const [extraFolders, setExtraFolders] = useState<HrWorkDriveExtraFolder[]>(
    folder.extraFolders ?? [],
  );
  const [employeeFolderTemplate, setEmployeeFolderTemplate] = useState(
    folder.employeeFolderTemplate,
  );
  const [autoCreateFolders, setAutoCreateFolders] = useState(
    folder.autoCreateFolders,
  );
  const [docSubfolders, setDocSubfolders] = useState<HrWorkDriveDocSubfolder[]>(
    () =>
      mergeDocSubfoldersForUi(
        folder.docSubfolders,
        folder.fileNameTemplate,
      ),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [syncingNames, setSyncingNames] = useState(false);

  const legacyFileNameTemplate =
    docSubfolders.find((row) => row.active)?.fileSlots[0]?.fileNameTemplate ||
    folder.fileNameTemplate ||
    "{doc_label}_{emp_no}_{yyyy-MM-dd}";

  const watch = useMemo(
    () =>
      [
        teamFolderName,
        teamFolderId,
        hrFolderName,
        hrFolderId,
        employeeDocsFolderName,
        employeeDocsFolderId,
        JSON.stringify(extraFolders),
        employeeFolderTemplate,
        String(autoCreateFolders),
        JSON.stringify(docSubfolders),
      ].join("|"),
    [
      teamFolderName,
      teamFolderId,
      hrFolderName,
      hrFolderId,
      employeeDocsFolderName,
      employeeDocsFolderId,
      extraFolders,
      employeeFolderTemplate,
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

  function updateDocSlot(
    kind: HrWorkDriveDocSubfolder["kind"],
    slotId: string,
    patch: Partial<HrWorkDriveDocFileSlot>,
  ) {
    setDocSubfolders((rows) =>
      rows.map((row) => {
        if (row.kind !== kind) return row;
        return {
          ...row,
          fileSlots: row.fileSlots.map((slot) =>
            slot.id === slotId ? { ...slot, ...patch } : slot,
          ),
        };
      }),
    );
  }

  function addDocSlot(kind: HrWorkDriveDocSubfolder["kind"]) {
    setDocSubfolders((rows) =>
      rows.map((row) => {
        if (row.kind !== kind) return row;
        return {
          ...row,
          fileSlots: [...row.fileSlots, newDocFileSlot()],
        };
      }),
    );
  }

  function removeDocSlot(
    kind: HrWorkDriveDocSubfolder["kind"],
    slotId: string,
  ) {
    setDocSubfolders((rows) =>
      rows.map((row) => {
        if (row.kind !== kind) return row;
        if (row.fileSlots.length <= 1) return row;
        return {
          ...row,
          fileSlots: row.fileSlots.filter((slot) => slot.id !== slotId),
        };
      }),
    );
  }

  function updateExtra(id: string, patch: Partial<HrWorkDriveExtraFolder>) {
    setExtraFolders((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  const pathPreview = useMemo(() => {
    const team = teamFolderName.trim() || "SS-OPS-HUB";
    const module = hrFolderName.trim() || "Module folder";
    const empDocs = employeeDocsFolderName.trim() || "Employee Documents";
    const emp = employeeFolderTemplate.trim() || "{emp_no} — {full_name}";
    const activeDoc = docSubfolders.find((row) => row.active);
    const doc = activeDoc?.folderName.trim() || "Document type";
    const fileName =
      activeDoc?.fileSlots[0]?.fileNameTemplate.trim() ||
      legacyFileNameTemplate;
    return { team, module, empDocs, emp, doc, fileName };
  }, [
    teamFolderName,
    hrFolderName,
    employeeDocsFolderName,
    employeeFolderTemplate,
    docSubfolders,
    legacyFileNameTemplate,
  ]);

  async function handleSyncNames() {
    if (mode !== "edit" || !folder.id) return;
    setSyncingNames(true);
    setStatusMessage(null);
    setStatusError(null);
    try {
      const result = await syncWorkDriveFolderNamesFromZoho(
        connectionId,
        folder.id,
      );
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      setTeamFolderName(result.folder.teamFolderName);
      setTeamFolderId(result.folder.teamFolderId);
      setHrFolderName(result.folder.hrFolderName);
      setHrFolderId(result.folder.hrFolderId);
      setEmployeeDocsFolderName(
        result.folder.employeeDocsFolderName || "Employee Documents",
      );
      setEmployeeDocsFolderId(result.folder.employeeDocsFolderId);
      setExtraFolders(result.folder.extraFolders ?? []);
      setStatusMessage(result.message);
      router.refresh();
    } finally {
      setSyncingNames(false);
    }
  }

  return (
    <div className="space-y-4">
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

      <GuardedSettingsForm
        watch={watch}
        action={async (formData) => {
          setStatusMessage(null);
          setStatusError(null);
          formData.set("connection_id", connectionId);
          formData.set("folder_label", hrFolderName);
          formData.set("extra_folders_json", JSON.stringify(extraFolders));
          if (mode === "edit" && folder.id) {
            formData.set("folder_id", folder.id);
          }
          const result = await saveWorkDriveFolder(formData);
          if (!result.ok) {
            setStatusError(result.error);
            return;
          }
          const notes =
            result.notes?.filter(Boolean).join(" ") ??
            "Drive folder saved.";
          setStatusMessage(
            result.notes?.length
              ? `Drive folder saved. ${notes}`
              : "Drive folder saved.",
          );
          router.push(
            toScopedHref(
              `/settings/drive-config/${result.connectionId}/folders/${result.folderId}`,
              scope,
              slug,
            ),
          );
          router.refresh();
        }}
        className="space-y-4"
      >
        <input type="hidden" name="connection_id" value={connectionId} />
        {mode === "edit" && folder.id ? (
          <input type="hidden" name="folder_id" value={folder.id} />
        ) : null}
        <input
          type="hidden"
          name="module_key"
          value={folder.moduleKey || "custom"}
        />
        <input
          type="hidden"
          name="extra_folders_json"
          value={JSON.stringify(extraFolders)}
        />

        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
                {mode === "add" ? "Add folder" : "Storage path"}
              </h4>
              <p className="mt-1 text-xs text-black/45">
                Tree: SS-OPS-HUB → module folder → Employee Documents → employee
                → doc type. IDs come from the WorkDrive URL (
                <span className="font-mono">/ws/…</span> for the team root,{" "}
                <span className="font-mono">/folders/…</span> for children).
              </p>
            </div>
            {mode === "edit" && folder.id ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={syncingNames}
                onClick={() => void handleSyncNames()}
              >
                <RefreshCw
                  className={cn(
                    "mr-1.5 h-3.5 w-3.5",
                    syncingNames && "animate-spin",
                  )}
                  aria-hidden
                />
                {syncingNames ? "Syncing…" : "Sync names from Zoho"}
              </Button>
            ) : null}
          </div>

          <div
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-black/8 bg-black/[0.02] px-3 py-2 text-xs"
            aria-label="Upload path preview"
          >
            <PathSegment label={pathPreview.team} />
            <span className="text-black/25">/</span>
            <PathSegment label={pathPreview.module} />
            <span className="text-black/25">/</span>
            <PathSegment label={pathPreview.empDocs} />
            <span className="text-black/25">/</span>
            <PathSegment label={pathPreview.emp} muted />
            <span className="text-black/25">/</span>
            <PathSegment label={pathPreview.doc} muted />
            <span className="text-black/25">/</span>
            <span className="truncate italic text-black/40">
              {pathPreview.fileName}…
            </span>
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

          <div className="space-y-1 rounded-xl border border-black/8 bg-white/70 p-3 sm:p-4">
            <FolderNode
              depth={0}
              title="Team folder (SS-OPS-HUB)"
              hint="Workspace root under ZOHO WorkDrive. Folder ID is the /ws/… segment."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="team_folder_name">Folder name</Label>
                  <Input
                    id="team_folder_name"
                    name="team_folder_name"
                    value={teamFolderName}
                    onChange={(e) => setTeamFolderName(e.target.value)}
                    placeholder="SS-OPS-HUB"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="team_folder_id">Folder ID</Label>
                  <Input
                    id="team_folder_id"
                    name="team_folder_id"
                    value={teamFolderId}
                    onChange={(e) => setTeamFolderId(e.target.value)}
                    placeholder="…/ws/<id>"
                    className="font-mono text-[13px]"
                  />
                </div>
              </div>

              <FolderNode
                depth={1}
                title="Module folder"
                hint="Nav tab under this connection (e.g. Human Resources). Parent is SS-OPS-HUB."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="hr_folder_name">Folder name (tab)</Label>
                    <Input
                      id="hr_folder_name"
                      name="hr_folder_name"
                      value={hrFolderName}
                      onChange={(e) => setHrFolderName(e.target.value)}
                      placeholder="Human Resources"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hr_folder_id">Folder ID</Label>
                    <Input
                      id="hr_folder_id"
                      name="hr_folder_id"
                      value={hrFolderId}
                      onChange={(e) => setHrFolderId(e.target.value)}
                      placeholder="…/folders/<id>"
                      className="font-mono text-[13px]"
                    />
                  </div>
                </div>

                <FolderNode
                  depth={2}
                  title="Employee Documents"
                  hint="Working parent for per-employee folders."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="employee_docs_folder_name">
                        Folder name
                      </Label>
                      <Input
                        id="employee_docs_folder_name"
                        name="employee_docs_folder_name"
                        value={employeeDocsFolderName}
                        onChange={(e) =>
                          setEmployeeDocsFolderName(e.target.value)
                        }
                        placeholder="Employee Documents"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="employee_docs_folder_id">Folder ID</Label>
                      <Input
                        id="employee_docs_folder_id"
                        name="employee_docs_folder_id"
                        value={employeeDocsFolderId}
                        onChange={(e) =>
                          setEmployeeDocsFolderId(e.target.value)
                        }
                        placeholder="…/folders/<id>"
                        className="font-mono text-[13px]"
                      />
                    </div>
                  </div>

                  <FolderNode
                    depth={3}
                    title="Employee folder"
                    hint="Created under Employee Documents for each staff member."
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="employee_folder_template">
                        Folder name template
                      </Label>
                      <Input
                        id="employee_folder_template"
                        name="employee_folder_template"
                        value={employeeFolderTemplate}
                        onChange={(e) =>
                          setEmployeeFolderTemplate(e.target.value)
                        }
                      />
                      <p className="text-[11px] text-black/40">
                        Tokens: {"{emp_no}"} {"{full_name}"} {"{first_name}"}{" "}
                        {"{last_name}"}
                      </p>
                    </div>

                    <FolderNode
                      depth={4}
                      title="Document type subfolders"
                      hint="One subfolder per document kind. Set auto file naming per file part (e.g. Emirates ID Front + Back)."
                      collapsible
                      defaultOpen
                    >
                      <input
                        type="hidden"
                        name="doc_subfolders_json"
                        value={JSON.stringify(docSubfolders)}
                      />
                      <input
                        type="hidden"
                        name="file_name_template"
                        value={legacyFileNameTemplate}
                      />
                      <div className="overflow-x-auto rounded-lg border border-black/8">
                        <table className="w-full min-w-[48rem] table-fixed text-left text-sm">
                          <colgroup>
                            <col className="w-14" />
                            <col className="w-[7.5rem]" />
                            <col className="w-[10rem]" />
                            <col />
                          </colgroup>
                          <thead className="bg-black/[0.03] text-[11px] uppercase tracking-wide text-black/45">
                            <tr>
                              <th className="px-3 py-2 font-medium">Active</th>
                              <th className="px-3 py-2 font-medium">
                                Document
                              </th>
                              <th className="px-3 py-2 font-medium">
                                Subfolder name
                              </th>
                              <th className="px-3 py-2 font-medium">
                                Auto file naming
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {docSubfolders.map((row) => (
                              <tr
                                key={row.kind}
                                className="border-t border-black/5 align-top"
                              >
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={row.active}
                                    onChange={(e) =>
                                      updateDoc(row.kind, {
                                        active: e.target.checked,
                                      })
                                    }
                                    className="mt-2 rounded border-black/20"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <div
                                    className="truncate pt-1.5 text-xs font-medium text-[#3D421F]"
                                    title={row.folderName || row.label}
                                  >
                                    {row.folderName || row.label}
                                  </div>
                                  <p
                                    className="mt-0.5 truncate font-mono text-[10px] text-black/35"
                                    title={row.label}
                                  >
                                    {row.label}
                                  </p>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={row.folderName}
                                    onChange={(e) =>
                                      updateDoc(row.kind, {
                                        folderName: e.target.value,
                                      })
                                    }
                                    className="h-8"
                                  />
                                </td>
                                <td className="min-w-0 px-3 py-2">
                                  <div className="space-y-2">
                                    {row.fileSlots.map((slot) => (
                                      <div
                                        key={slot.id}
                                        className="space-y-1 rounded-md border border-black/8 bg-white/80 p-2"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <Input
                                            value={slot.label}
                                            onChange={(e) =>
                                              updateDocSlot(
                                                row.kind,
                                                slot.id,
                                                { label: e.target.value },
                                              )
                                            }
                                            placeholder="Part"
                                            className="h-7 w-[4.75rem] shrink-0 text-xs"
                                            aria-label={`${row.label} part label`}
                                          />
                                          <Input
                                            value={slot.fileNameTemplate}
                                            onChange={(e) =>
                                              updateDocSlot(
                                                row.kind,
                                                slot.id,
                                                {
                                                  fileNameTemplate:
                                                    e.target.value,
                                                },
                                              )
                                            }
                                            placeholder="{doc_name}_{first_name}_{last_name}_{doc_expiry}"
                                            className="h-7 min-w-0 flex-1 font-mono text-[11px]"
                                            aria-label={`${row.label} ${slot.label} file name template`}
                                          />
                                          {row.fileSlots.length > 1 ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeDocSlot(
                                                  row.kind,
                                                  slot.id,
                                                )
                                              }
                                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-black/40 transition hover:bg-black/5 hover:text-[#3D421F]"
                                              aria-label={`Remove ${slot.label || "file part"}`}
                                            >
                                              <Trash2
                                                className="h-3.5 w-3.5"
                                                aria-hidden
                                              />
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => addDocSlot(row.kind)}
                                      className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[#3D421F]/80 transition hover:bg-black/5"
                                    >
                                      <Plus
                                        className="h-3 w-3"
                                        aria-hidden
                                      />
                                      Add file part
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-black/40">
                        Extension is kept from the upload. Click a token to copy
                        it into auto file naming:
                      </p>
                      <FileNameTokenList />
                    </FolderNode>
                  </FolderNode>
                </FolderNode>

                <FolderNode
                  depth={2}
                  title="Extra folders under module"
                  hint="Siblings of Employee Documents (e.g. Policies)."
                >
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setExtraFolders((rows) => [...rows, newExtraFolder()])
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Add folder
                    </Button>
                  </div>
                  {extraFolders.length === 0 ? (
                    <p className="text-xs text-black/40">No extra folders yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {extraFolders.map((row) => (
                        <div
                          key={row.id}
                          className="grid gap-2 rounded-lg border border-black/8 bg-white/80 p-3 sm:grid-cols-[1fr_1fr_auto]"
                        >
                          <div className="space-y-1.5">
                            <Label htmlFor={`extra_name_${row.id}`}>Name</Label>
                            <Input
                              id={`extra_name_${row.id}`}
                              value={row.name}
                              onChange={(e) =>
                                updateExtra(row.id, { name: e.target.value })
                              }
                              placeholder="Folder name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`extra_id_${row.id}`}>
                              Folder ID
                            </Label>
                            <Input
                              id={`extra_id_${row.id}`}
                              value={row.folderId}
                              onChange={(e) =>
                                updateExtra(row.id, {
                                  folderId: e.target.value,
                                })
                              }
                              placeholder="…/folders/<id>"
                              className="font-mono text-[13px]"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-black/50"
                              onClick={() =>
                                setExtraFolders((rows) =>
                                  rows.filter((r) => r.id !== row.id),
                                )
                              }
                              aria-label={`Remove ${row.name || "folder"}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </FolderNode>
              </FolderNode>
            </FolderNode>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <SaveFolderButton
            label={mode === "add" ? "Create folder" : "Save folder"}
          />
        </div>
      </GuardedSettingsForm>
    </div>
  );
}
