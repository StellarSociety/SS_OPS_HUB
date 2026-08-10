"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";

async function runAction<T extends { ok: boolean; error?: string }>(
  action: () => Promise<T>,
  successMessage: string,
): Promise<T | null> {
  try {
    const result = await action();
    if (!result.ok) {
      toast.error(result.error ?? "Something went wrong.");
      return null;
    }
    toast.saved(successMessage);
    return result;
  } catch {
    toast.error("Network error — check your connection and try again.");
    return null;
  }
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSequence } from "@/lib/actions/accounting-settings";
import type {
  AccSequenceReset,
  DocumentSequence,
  LegalEntity,
} from "@/lib/accounting/types";

type Props = {
  entities: LegalEntity[];
  sequences: DocumentSequence[];
  canEdit: boolean;
};

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

function preview(seq: DocumentSequence, year = new Date().getFullYear()) {
  const next = String(seq.current_value + 1).padStart(seq.padding, "0");
  if (seq.reset_rule === "yearly") return `${seq.prefix}${year}-${next}`;
  if (seq.reset_rule === "monthly") {
    const mm = String(new Date().getMonth() + 1).padStart(2, "0");
    return `${seq.prefix}${year}${mm}-${next}`;
  }
  return `${seq.prefix}${next}`;
}

export function SequencesSettingsSection({
  entities,
  sequences,
  canEdit,
}: Props) {
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<
    Record<string, { prefix: string; padding: number; reset_rule: AccSequenceReset }>
  >(() =>
    Object.fromEntries(
      sequences.map((s) => [
        s.id,
        {
          prefix: s.prefix,
          padding: s.padding,
          reset_rule: s.reset_rule,
        },
      ]),
    ),
  );

  const rows = sequences.filter((s) => s.entity_id === entityId);

  function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("prefix", d.prefix);
    fd.set("padding", String(d.padding));
    fd.set("reset_rule", d.reset_rule);
    startTransition(async () => {
      await runAction(() => updateSequence(fd), "Sequence updated");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[#3D421F]">
            Document sequences
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Numbering is per legal entity. Example format uses the reset rule
            below.
          </p>
        </div>
        <select
          className={selectClass}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.entity_code} — {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2 font-medium">Doc type</th>
              <th className="px-3 py-2 font-medium">Prefix</th>
              <th className="px-3 py-2 font-medium">Padding</th>
              <th className="px-3 py-2 font-medium">Reset</th>
              <th className="px-3 py-2 font-medium">Next example</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const d = drafts[s.id] ?? {
                prefix: s.prefix,
                padding: s.padding,
                reset_rule: s.reset_rule,
              };
              return (
                <tr key={s.id} className="border-t border-black/5">
                  <td className="px-3 py-2 font-medium text-[#3D421F]">
                    {s.doc_type}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      className="h-9 w-28"
                      disabled={!canEdit}
                      value={d.prefix}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [s.id]: { ...d, prefix: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      className="h-9 w-20"
                      type="number"
                      min={1}
                      max={12}
                      disabled={!canEdit}
                      value={d.padding}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [s.id]: {
                            ...d,
                            padding: Number(e.target.value) || 1,
                          },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={selectClass}
                      disabled={!canEdit}
                      value={d.reset_rule}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [s.id]: {
                            ...d,
                            reset_rule: e.target.value as AccSequenceReset,
                          },
                        }))
                      }
                    >
                      <option value="yearly">Yearly</option>
                      <option value="monthly">Monthly</option>
                      <option value="never">Never</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-black/60">
                    {preview({ ...s, ...d })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => save(s.id)}
                      >
                        Save
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
