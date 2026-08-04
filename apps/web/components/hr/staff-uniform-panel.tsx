"use client";

import { useEffect, useState } from "react";
import { Loader2, Shirt } from "lucide-react";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { listStaffUniforms } from "@/lib/actions/hr-uniforms";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import type { UniformStaffItemRow } from "@/lib/hr/types";

type StaffUniformPanelProps = {
  staffId: string | null | undefined;
};

export function StaffUniformPanel({ staffId }: StaffUniformPanelProps) {
  const [loading, setLoading] = useState(Boolean(staffId));
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<UniformStaffItemRow[]>([]);

  useEffect(() => {
    if (!staffId) {
      setLoading(false);
      setError(null);
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    void listStaffUniforms({ staffId })
      .then((rows) => setItems(rows))
      .catch((err) => {
        setItems([]);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load assigned uniforms.",
        );
      })
      .finally(() => setLoading(false));
  }, [staffId]);

  const totalValue = items.reduce((sum, item) => {
    const unit = item.piece?.unit_value ?? 0;
    return sum + unit * item.quantity;
  }, 0);

  if (!staffId) {
    return (
      <Card className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
        <Shirt
          className="mb-3 h-8 w-8 text-[var(--venue-primary,#818a40)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="max-w-md text-sm text-black/50">
          Save this employee first to see their assigned uniforms.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex w-full flex-col p-5">
      <div className="mb-4 flex items-center gap-2">
        <Shirt
          className="h-3.5 w-3.5 text-[#3D421F]/70"
          strokeWidth={2}
          aria-hidden
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
          Assigned uniforms
        </h3>
        {!loading && !error ? (
          <span className="ml-auto text-[11px] tabular-nums text-black/45">
            {items.length} piece{items.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center text-black/45">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="sr-only">Loading uniforms…</span>
        </div>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 bg-white/40 px-4 py-10 text-center">
          <p className="text-sm text-black/50">
            No uniform pieces are currently assigned to this employee.
          </p>
          <ScopedLink
            href="/hr/assets/uniform/employees"
            className="mt-3 inline-block text-sm font-medium text-[#3D421F] hover:underline"
          >
            Open uniform employees
          </ScopedLink>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10">
          <table className="min-w-full text-sm">
            <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
              <tr>
                <th className="px-3 py-2.5 font-medium">Uniform name</th>
                <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                <th className="px-3 py-2.5 font-medium">Date provided</th>
                <th className="px-3 py-2.5 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white/60">
              {items.map((item) => {
                const unit = item.piece?.unit_value ?? 0;
                const subtotal = unit * item.quantity;
                return (
                  <tr key={item.id} className="text-[#3D421F]">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">
                        {item.piece?.name ?? "Unknown piece"}
                      </div>
                      {item.notes ? (
                        <div className="text-xs text-black/45">{item.notes}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-black/65">
                      {formatDateOnly(item.provided_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-black/65">
                      {subtotal > 0 ? formatAed(subtotal) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-black/10 bg-black/[0.02]">
              <tr className="font-medium text-[#3D421F]">
                <td className="px-3 py-2.5" colSpan={3}>
                  Total value
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {totalValue > 0 ? formatAed(totalValue) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
