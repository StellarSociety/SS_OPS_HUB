"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Folder,
  Loader2,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { saveWorkDriveFolder } from "@/lib/actions/hr-workdrive";
import type {
  HrWorkDriveDocFileSlot,
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

const WIZARD_STEPS = [
  { id: "folder", label: "Folder" },
  { id: "count", label: "Subfolder count" },
  { id: "subfolders", label: "Subfolders" },
  { id: "fnm", label: "File Name Management" },
  { id: "naming", label: "File naming" },
  { id: "connect", label: "Connect" },
] as const;

type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

type WizardSubfolder = {
  id: string;
  name: string;
  folderId: string;
  fileNameManagement: boolean;
  fileParts: HrWorkDriveDocFileSlot[];
};

const DEFAULT_FILE_TEMPLATE =
  "{doc_name}_{first_name}_{last_name}_{doc_expiry}";

function newFilePart(label = "File"): HrWorkDriveDocFileSlot {
  return {
    id: crypto.randomUUID().slice(0, 8),
    label,
    fileNameTemplate: DEFAULT_FILE_TEMPLATE,
  };
}

function newSubfolder(): WizardSubfolder {
  return {
    id: crypto.randomUUID(),
    name: "",
    folderId: "",
    fileNameManagement: true,
    fileParts: [newFilePart()],
  };
}

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

function StepIndicator({
  current,
  steps,
}: {
  current: WizardStepId;
  steps: ReadonlyArray<(typeof WIZARD_STEPS)[number]>;
}) {
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <ol className="flex flex-wrap gap-2" aria-label="Wizard progress">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              done && "bg-emerald-100 text-emerald-900",
              active && "bg-[#3D421F] text-white",
              !done && !active && "bg-black/[0.05] text-black/45",
            )}
          >
            <span className="font-mono text-[10px] opacity-70">{index + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

function PathPreview({
  team,
  folder,
  subfolders,
}: {
  team: string;
  folder: string;
  subfolders: WizardSubfolder[];
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-black/8 bg-black/[0.02] px-3 py-2 text-xs"
      aria-label="Folder tree preview"
    >
      <PathSegment label={team} />
      <span className="text-black/25">/</span>
      <PathSegment label={folder} />
      {subfolders
        .filter((row) => row.name.trim())
        .map((row) => (
          <span key={row.id} className="contents">
            <span className="text-black/25">/</span>
            <PathSegment label={row.name} muted />
          </span>
        ))}
    </div>
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

export function WorkDriveFolderWizard({
  connectionId,
  seed,
}: {
  connectionId: string;
  seed: HrWorkDriveFolderPublic;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();

  const [step, setStep] = useState<WizardStepId>("folder");
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [teamFolderName] = useState(seed.teamFolderName || "SS-OPS-HUB");
  const [teamFolderId] = useState(seed.teamFolderId);
  const [folderName, setFolderName] = useState("");
  const [folderId, setFolderId] = useState("");
  const [subfolderCount, setSubfolderCount] = useState(1);
  const [subfolders, setSubfolders] = useState<WizardSubfolder[]>([newSubfolder()]);
  const [autoCreateFolders, setAutoCreateFolders] = useState(true);

  const fnmSubfolders = useMemo(
    () => subfolders.filter((row) => row.fileNameManagement),
    [subfolders],
  );

  const visibleSteps = WIZARD_STEPS.filter((wizardStep) => {
    if (wizardStep.id === "naming" && fnmSubfolders.length === 0) {
      return false;
    }
    return true;
  });
  const stepIndex = visibleSteps.findIndex((wizardStep) => wizardStep.id === step);

  function setCount(count: number) {
    const next = Math.max(0, Math.min(20, count));
    setSubfolderCount(next);
    setSubfolders((rows) => {
      if (rows.length === next) return rows;
      if (rows.length < next) {
        return [
          ...rows,
          ...Array.from({ length: next - rows.length }, () => newSubfolder()),
        ];
      }
      return rows.slice(0, next);
    });
  }

  function updateSubfolder(id: string, patch: Partial<WizardSubfolder>) {
    setSubfolders((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function updateFilePart(
    subfolderId: string,
    partId: string,
    patch: Partial<HrWorkDriveDocFileSlot>,
  ) {
    setSubfolders((rows) =>
      rows.map((row) => {
        if (row.id !== subfolderId) return row;
        return {
          ...row,
          fileParts: row.fileParts.map((part) =>
            part.id === partId ? { ...part, ...patch } : part,
          ),
        };
      }),
    );
  }

  function addFilePart(subfolderId: string) {
    setSubfolders((rows) =>
      rows.map((row) => {
        if (row.id !== subfolderId) return row;
        return {
          ...row,
          fileParts: [
            ...row.fileParts,
            newFilePart(`Part ${row.fileParts.length + 1}`),
          ],
        };
      }),
    );
  }

  function removeFilePart(subfolderId: string, partId: string) {
    setSubfolders((rows) =>
      rows.map((row) => {
        if (row.id !== subfolderId || row.fileParts.length <= 1) return row;
        return {
          ...row,
          fileParts: row.fileParts.filter((part) => part.id !== partId),
        };
      }),
    );
  }

  function canAdvance(): boolean {
    switch (step) {
      case "folder":
        return Boolean(folderName.trim());
      case "count":
        return subfolderCount >= 0;
      case "subfolders":
        return (
          subfolderCount === 0 ||
          subfolders.every((row) => row.name.trim().length > 0)
        );
      case "fnm":
        return true;
      case "naming":
        return fnmSubfolders.every((row) =>
          row.fileParts.every((part) => part.fileNameTemplate.trim()),
        );
      case "connect":
        return true;
      default:
        return false;
    }
  }

  function goNext() {
    if (!canAdvance()) return;
    const next = visibleSteps[stepIndex + 1];
    if (next) setStep(next.id);
  }

  function goBack() {
    const prev = visibleSteps[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  async function handleConnect() {
    if (saving) return;
    setSaving(true);
    setStatusError(null);

    const extraFoldersForSave: HrWorkDriveExtraFolder[] = subfolders
      .filter((row) => row.name.trim())
      .map((row) => {
        const base: HrWorkDriveExtraFolder = {
          id: row.id,
          name: row.name.trim(),
          folderId: row.folderId.trim(),
        };
        if (!row.fileNameManagement) return base;
        return {
          ...base,
          fileNameManagement: true,
          fileSlots: row.fileParts.map((part) => ({
            id: part.id,
            label: part.label.trim() || "File",
            fileNameTemplate:
              part.fileNameTemplate.trim() || DEFAULT_FILE_TEMPLATE,
          })),
        };
      });

    const moduleKey =
      /human\s*resources/i.test(folderName) ? "hr" : "custom";

    const inactiveDocSubfolders = DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map(
      (defaults) => ({
        ...defaults,
        active: false,
        fileSlots: defaults.fileSlots.map((slot) => ({ ...slot })),
      }),
    );

    const formData = new FormData();
    formData.set("connection_id", connectionId);
    formData.set("module_key", moduleKey);
    formData.set("folder_label", folderName.trim());
    formData.set("team_folder_name", teamFolderName);
    formData.set("team_folder_id", teamFolderId);
    formData.set("hr_folder_name", folderName.trim());
    formData.set("hr_folder_id", folderId.trim());
    formData.set("employee_docs_folder_name", "");
    formData.set("employee_docs_folder_id", "");
    formData.set("employee_folder_template", "{emp_no} — {full_name}");
    formData.set("file_name_template", DEFAULT_FILE_TEMPLATE);
    formData.set("auto_create_folders", autoCreateFolders ? "true" : "false");
    formData.set("extra_folders_json", JSON.stringify(extraFoldersForSave));
    formData.set("doc_subfolders_json", JSON.stringify(inactiveDocSubfolders));

    try {
      const result = await saveWorkDriveFolder(formData);
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      router.push(
        toScopedHref(
          `/settings/drive-config/${result.connectionId}/folders/${result.folderId}`,
          scope,
          slug,
        ),
      );
      router.refresh();
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Could not connect folder.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {statusError ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {statusError}
        </p>
      ) : null}

      <Card className="space-y-5 p-5">
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
              Add folder under {teamFolderName}
            </h4>
            <p className="mt-1 text-xs text-black/45">
              Connect a new folder, add subfolders, and configure file naming per
              subfolder.
            </p>
          </div>
          <StepIndicator current={step} steps={visibleSteps} />
        </div>

        <PathPreview
          team={teamFolderName}
          folder={folderName || "New folder"}
          subfolders={subfolders}
        />

        {step === "folder" ? (
          <div className="space-y-4">
            <p className="text-sm text-black/55">
              Name the folder to connect under{" "}
              <strong>{teamFolderName}</strong>.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wizard_folder_name">Folder name</Label>
                <Input
                  id="wizard_folder_name"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Human Resources"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard_folder_id">Folder ID (optional)</Label>
                <Input
                  id="wizard_folder_id"
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  placeholder="…/folders/<id>"
                  className="font-mono text-[13px]"
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === "count" ? (
          <div className="space-y-4">
            <p className="text-sm text-black/55">
              How many subfolders sit inside{" "}
              <strong>{folderName || "this folder"}</strong>?
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCount(subfolderCount - 1)}
                disabled={subfolderCount === 0}
                aria-label="Decrease subfolder count"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[3rem] text-center text-2xl font-semibold tabular-nums text-[#3D421F]">
                {subfolderCount}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCount(subfolderCount + 1)}
                disabled={subfolderCount >= 20}
                aria-label="Increase subfolder count"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === "subfolders" ? (
          <div className="space-y-4">
            <p className="text-sm text-black/55">
              Enter a name and optional ZOHO folder ID for each subfolder.
            </p>
            {subfolders.length === 0 ? (
              <p className="text-xs text-black/40">
                No subfolders — go back to set the count to 0, or increase it.
              </p>
            ) : (
              <div className="space-y-3">
                {subfolders.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid gap-2 rounded-lg border border-black/8 bg-white/70 p-3 sm:grid-cols-2"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={`sub_name_${row.id}`}>
                        Subfolder {index + 1} name
                      </Label>
                      <Input
                        id={`sub_name_${row.id}`}
                        value={row.name}
                        onChange={(e) =>
                          updateSubfolder(row.id, { name: e.target.value })
                        }
                        placeholder="Employee Documents"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`sub_id_${row.id}`}>
                        Folder ID (optional)
                      </Label>
                      <Input
                        id={`sub_id_${row.id}`}
                        value={row.folderId}
                        onChange={(e) =>
                          updateSubfolder(row.id, { folderId: e.target.value })
                        }
                        placeholder="…/folders/<id>"
                        className="font-mono text-[13px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === "fnm" ? (
          <div className="space-y-4">
            <p className="text-sm text-black/55">
              For each subfolder, choose whether uploads need File Name
              Management (auto-renaming).
            </p>
            {subfolders.length === 0 ? (
              <p className="text-xs text-black/40">No subfolders to configure.</p>
            ) : (
              <div className="space-y-2">
                {subfolders.map((row) => (
                  <label
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-black/8 bg-white/70 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium text-[#3D421F]">
                      {row.name.trim() || "Untitled subfolder"}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs text-black/55">
                      <input
                        type="checkbox"
                        checked={row.fileNameManagement}
                        onChange={(e) =>
                          updateSubfolder(row.id, {
                            fileNameManagement: e.target.checked,
                          })
                        }
                        className="rounded border-black/20"
                      />
                      File Name Management
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === "naming" ? (
          <div className="space-y-5">
            <p className="text-sm text-black/55">
              Set file naming rules for subfolders with File Name Management
              enabled.
            </p>
            <FileNameTokenList />
            {fnmSubfolders.map((row) => (
              <div
                key={row.id}
                className="space-y-2 rounded-lg border border-black/8 bg-white/70 p-3"
              >
                <p className="text-sm font-medium text-[#3D421F]">
                  {row.name.trim() || "Untitled subfolder"}
                </p>
                {row.fileParts.map((part) => (
                  <div
                    key={part.id}
                    className="flex items-center gap-2 rounded-md border border-black/8 bg-white/80 p-2"
                  >
                    <Input
                      value={part.label}
                      onChange={(e) =>
                        updateFilePart(row.id, part.id, {
                          label: e.target.value,
                        })
                      }
                      placeholder="Part"
                      className="h-8 w-24 shrink-0 text-xs"
                      aria-label={`${row.name} part label`}
                    />
                    <Input
                      value={part.fileNameTemplate}
                      onChange={(e) =>
                        updateFilePart(row.id, part.id, {
                          fileNameTemplate: e.target.value,
                        })
                      }
                      placeholder={DEFAULT_FILE_TEMPLATE}
                      className="h-8 min-w-0 flex-1 font-mono text-[11px]"
                      aria-label={`${row.name} ${part.label} template`}
                    />
                    {row.fileParts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeFilePart(row.id, part.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-black/40 hover:bg-black/5 hover:text-[#3D421F]"
                        aria-label={`Remove ${part.label || "file part"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addFilePart(row.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[#3D421F]/80 hover:bg-black/5"
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  Add file part
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {step === "connect" ? (
          <div className="space-y-4">
            <p className="text-sm text-black/55">
              Review and connect. Leave IDs blank to auto-create folders in ZOHO
              when enabled.
            </p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-black/45">Folder</dt>
                <dd className="font-medium text-[#3D421F]">
                  {folderName || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-black/45">Subfolders</dt>
                <dd className="font-medium text-[#3D421F]">
                  {subfolders.filter((row) => row.name.trim()).length}
                </dd>
              </div>
              <div>
                <dt className="text-black/45">With File Name Management</dt>
                <dd className="font-medium text-[#3D421F]">
                  {fnmSubfolders.length}
                </dd>
              </div>
            </dl>
            <label className="flex items-center gap-2 text-sm text-[#3D421F]">
              <input
                type="checkbox"
                checked={autoCreateFolders}
                onChange={(e) => setAutoCreateFolders(e.target.checked)}
                className="rounded border-black/20"
              />
              Auto-create missing folders in ZOHO WorkDrive
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/8 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={stepIndex === 0 || saving}
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            Back
          </Button>

          {step === "connect" ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void handleConnect()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Connecting…
                </>
              ) : (
                "Connect folder"
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!canAdvance()}
              onClick={goNext}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
