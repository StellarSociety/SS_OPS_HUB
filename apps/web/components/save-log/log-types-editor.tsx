"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  archiveSaveLogType,
  saveSaveLogType,
} from "@/lib/actions/save-log";
import type { SaveLogType } from "@/lib/save-log/types";
import { cn } from "@/lib/utils";

type LogTypesEditorProps = {
  types: SaveLogType[];
  canEdit: boolean;
};

export function LogTypesEditor({ types, canEdit }: LogTypesEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        These are the HACCP records the kitchen uploads each day. Required types
        show as missing on the dashboard until a file is attached.
      </p>

      <ul className="space-y-3">
        {types.map((type) => (
          <li key={type.id}>
            <TypeRow
              type={type}
              canEdit={canEdit}
              busy={pending}
              onChanged={() => router.refresh()}
            />
          </li>
        ))}
      </ul>

      {canEdit && adding ? (
        <TypeForm
          busy={pending}
          onCancel={() => setAdding(false)}
          onSave={(formData) => {
            startTransition(async () => {
              const result = await saveSaveLogType(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.saved("Log type added.");
              setAdding(false);
              router.refresh();
            });
          }}
        />
      ) : null}

      {canEdit && !adding ? (
        <Button type="button" onClick={() => setAdding(true)}>
          Add log type
        </Button>
      ) : null}
    </div>
  );
}

function TypeRow({
  type,
  canEdit,
  busy,
  onChanged,
}: {
  type: SaveLogType;
  canEdit: boolean;
  busy: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const archived = Boolean(type.archived_at);

  if (editing && canEdit) {
    return (
      <TypeForm
        type={type}
        busy={busy}
        onCancel={() => setEditing(false)}
        onSave={async (formData) => {
          const result = await saveSaveLogType(formData);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.saved("Log type saved.");
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <Card
      className={cn("flex items-start justify-between gap-4 p-4", archived && "opacity-60")}
    >
      <div>
        <p className="font-medium text-[#3D421F]">{type.label}</p>
        {type.description ? (
          <p className="mt-0.5 text-sm text-black/50">{type.description}</p>
        ) : null}
        <p className="mt-1 text-xs uppercase tracking-wide text-black/40">
          {archived
            ? "Archived"
            : type.required_daily
              ? "Required daily"
              : "Optional"}
        </p>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 gap-2">
          {!archived ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const formData = new FormData();
              formData.set("id", type.id);
              if (archived) formData.set("restore", "1");
              const result = await archiveSaveLogType(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.saved(archived ? "Log type restored." : "Log type archived.");
              onChanged();
            }}
          >
            {archived ? "Restore" : "Archive"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function TypeForm({
  type,
  busy,
  onCancel,
  onSave,
}: {
  type?: SaveLogType;
  busy: boolean;
  onCancel: () => void;
  onSave: (formData: FormData) => void | Promise<void>;
}) {
  const [label, setLabel] = useState(type?.label ?? "");
  const [description, setDescription] = useState(type?.description ?? "");
  const [requiredDaily, setRequiredDaily] = useState(type?.required_daily ?? true);

  return (
    <Card className="space-y-3 p-4">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Log type name"
        disabled={busy}
      />
      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What should be uploaded for this log?"
        disabled={busy}
        className="min-h-[72px]"
      />
      <label className="flex items-center gap-2 text-sm text-[#3D421F]">
        <input
          type="checkbox"
          checked={requiredDaily}
          onChange={(event) => setRequiredDaily(event.target.checked)}
          disabled={busy}
        />
        Required every day
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={busy || !label.trim()}
          onClick={() => {
            const formData = new FormData();
            if (type) formData.set("id", type.id);
            formData.set("label", label);
            formData.set("description", description);
            formData.set("requiredDaily", requiredDaily ? "1" : "0");
            formData.set("sortOrder", String(type?.sort_order ?? 100));
            void onSave(formData);
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
