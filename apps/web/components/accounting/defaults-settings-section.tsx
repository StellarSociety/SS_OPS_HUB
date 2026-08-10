"use client";

import { useTransition } from "react";
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

import { updateSystemDefaultAccount } from "@/lib/actions/accounting-settings";
import type { Account, SystemDefaultAccount } from "@/lib/accounting/types";

type Props = {
  defaults: SystemDefaultAccount[];
  accounts: Account[];
  canEdit: boolean;
};

const selectClass =
  "h-9 w-full max-w-md rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]";

export function DefaultsSettingsSection({
  defaults,
  accounts,
  canEdit,
}: Props) {
  const [pending, startTransition] = useTransition();
  const postable = accounts.filter(
    (a) => a.is_postable || a.node_type === "system",
  );

  function onChange(key: string, accountId: string) {
    const fd = new FormData();
    fd.set("key", key);
    fd.set("account_id", accountId);
    startTransition(async () => {
      await runAction(() => updateSystemDefaultAccount(fd), "Default account updated");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-[#3D421F]">
          System default accounts
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Auto-posting targets used by sales, VAT, AP/AR, FX, and period close.
          Change the mapping here — never hardcode account codes in feature
          code.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2 font-medium">Purpose</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Account</th>
            </tr>
          </thead>
          <tbody>
            {defaults.map((row) => (
              <tr key={row.key} className="border-t border-black/5">
                <td className="px-3 py-2 font-medium text-[#3D421F]">
                  {row.label}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-black/55">
                  {row.key}
                </td>
                <td className="px-3 py-2">
                  <select
                    className={selectClass}
                    disabled={!canEdit || pending}
                    value={row.account_id}
                    onChange={(e) => onChange(row.key, e.target.value)}
                  >
                    {postable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
