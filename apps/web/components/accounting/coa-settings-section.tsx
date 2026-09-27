"use client";

import { useMemo, useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { updateAccount } from "@/lib/actions/accounting-settings";
import {
  COA_EXPORT_COLUMN_WIDTHS,
  COA_EXPORT_HEADERS,
  coaExportFilename,
  coaExportRows,
} from "@/lib/accounting/coa-export";
import type { Account } from "@/lib/accounting/types";
import { buildExcelWorkbook, downloadExcelWorkbook } from "@/lib/sales/excel-utils";

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

type Props = {
  accounts: Account[];
  canEdit: boolean;
};

export function CoaSettingsSection({ accounts, canEdit }: Props) {
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.code.includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.account_type.includes(q) ||
        a.node_type.includes(q),
    );
  }, [accounts, filter]);

  function beginEdit(account: Account) {
    setEditingId(account.id);
    setName(account.name);
    setActive(account.active);
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const workbook = await buildExcelWorkbook(
        "Chart of Accounts",
        [...COA_EXPORT_HEADERS],
        coaExportRows(accounts),
      );
      const sheet = workbook.Sheets["Chart of Accounts"];
      if (sheet) {
        sheet["!cols"] = COA_EXPORT_COLUMN_WIDTHS.map((wch) => ({ wch }));
      }
      await downloadExcelWorkbook(workbook, coaExportFilename());
      toast.saved(`Exported ${accounts.length} accounts.`);
    } catch {
      toast.error("Could not export the chart of accounts.");
    } finally {
      setExporting(false);
    }
  }

  function save() {
    if (!editingId) return;
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("name", name);
    fd.set("active", active ? "true" : "false");
    startTransition(async () => {
      const result = await runAction(() => updateAccount(fd), "Account updated");
      if (result) setEditingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[#3D421F]">
            Chart of Accounts
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Baseline restaurant COA ({accounts.length} accounts). Only ledger
            accounts are postable. Headers/groups/system rows are structure
            only.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            className="border border-black/10"
            disabled={exporting || accounts.length === 0}
            onClick={() => void exportExcel()}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export Excel"}
          </Button>
          <Input
            className="max-w-xs"
            placeholder="Filter by code or name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Node</th>
              <th className="px-3 py-2 font-medium">Postable</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const indent =
                a.node_type === "header"
                  ? ""
                  : a.node_type === "group"
                    ? "pl-3"
                    : "pl-6";
              const isEditing = editingId === a.id;
              return (
                <tr key={a.id} className="border-t border-black/5 align-middle">
                  <td className={`px-3 py-2 font-mono text-xs ${indent}`}>
                    {a.code}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-9"
                      />
                    ) : (
                      <span
                        className={
                          a.node_type === "header" || a.node_type === "group"
                            ? "font-medium text-[#3D421F]"
                            : "text-black/75"
                        }
                      >
                        {a.name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-black/55">
                    {a.account_type}
                  </td>
                  <td className="px-3 py-2 text-xs text-black/55">
                    {a.node_type}
                    {a.is_control ? " · control" : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.is_postable ? "yes" : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {isEditing ? (
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => setActive(e.target.checked)}
                        />
                        Active
                      </label>
                    ) : a.active ? (
                      "yes"
                    ) : (
                      <span className="text-amber-700">off</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canEdit ? (
                      isEditing ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={save}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => beginEdit(a)}
                        >
                          Edit
                        </Button>
                      )
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
