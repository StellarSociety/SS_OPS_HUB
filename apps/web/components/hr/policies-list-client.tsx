"use client";

import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Pencil,
  Plus,
  ScrollText,
  Settings2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PolicyEditorDialog } from "@/components/hr/policy-editor-dialog";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  deletePolicy,
  savePolicyDeliverySettings,
  setPolicyArchived,
} from "@/lib/actions/hr-policies";
import { formatDateOnly } from "@/lib/hr/derived";
import type { HrPolicySettings, PolicySummary, PolicyTemplate } from "@/lib/hr/policies";
import type { PayslipEmailRecipientField } from "@/lib/hr/types";
import { cn } from "@/lib/utils";
import { toScopedHref } from "@/lib/venue/scope-routing";

/** Scope app-relative hrefs built at render time (e.g. per-policy links). */
export function useScoper(): (href: string) => string {
  const { scope, slug } = useVenueScope();
  return (href) => toScopedHref(href, scope, slug);
}

export function PolicyProgress({ policy }: { policy: PolicySummary }) {
  const { sent, acknowledged, pending, declined } = policy.current;
  const pct = sent > 0 ? Math.round((acknowledged / sent) * 100) : 0;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-[#3D421F]">
          {acknowledged}/{sent} acknowledged
        </span>
        {pending > 0 ? <span className="text-amber-700">{pending} pending</span> : null}
        {declined > 0 ? (
          <span className="text-red-700">{declined} not acknowledged</span>
        ) : null}
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PoliciesListClient({
  policies,
  canManage,
  delivery,
  connectionFromEmail,
}: {
  policies: PolicySummary[];
  canManage: boolean;
  delivery: Pick<HrPolicySettings, "recipientField" | "fromEmail">;
  connectionFromEmail: string;
}) {
  const router = useRouter();
  const scoped = useScoper();
  const [editing, setEditing] = useState<PolicyTemplate | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const archivedCount = policies.filter((p) => p.archived).length;
  const visible = policies.filter((p) => p.archived === showArchived);

  async function toggleArchived(policy: PolicySummary) {
    const result = await setPolicyArchived({
      id: policy.id,
      archived: !policy.archived,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.saved(policy.archived ? "Policy restored." : "Policy archived.");
    router.refresh();
  }

  async function remove(policy: PolicySummary) {
    if (!window.confirm(`Delete "${policy.title}"? This cannot be undone.`)) return;
    const result = await deletePolicy(policy.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.saved("Policy deleted.");
    router.refresh();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-black/60">
          Write a policy once, email it to employees, and track who has
          acknowledged it. Responses also appear under Acknowledgements.
        </p>
        <div className="flex items-center gap-2">
          {archivedCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className="text-xs font-medium text-black/50 hover:text-[#3D421F]"
            >
              {showArchived ? "Show active" : `Archived (${archivedCount})`}
            </button>
          ) : null}
          {canManage ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                onClick={() => setSettingsOpen((value) => !value)}
                aria-expanded={settingsOpen}
              >
                <Settings2 className="size-3.5" />
                Delivery
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                onClick={() => setEditing("new")}
              >
                <Plus className="size-3.5" />
                New policy
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {settingsOpen && canManage ? (
        <DeliverySettingsCard
          delivery={delivery}
          connectionFromEmail={connectionFromEmail}
          onSaved={() => {
            setSettingsOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-14 text-center">
          <ScrollText className="size-8 text-black/25" />
          <p className="text-sm text-black/50">
            {showArchived
              ? "No archived policies."
              : "No policies yet. Create one to start collecting acknowledgements."}
          </p>
          {canManage && !showArchived ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
              onClick={() => setEditing("new")}
            >
              <Plus className="size-3.5" />
              New policy
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((policy) => (
            <Card
              key={policy.id}
              className={cn("flex flex-col gap-3 p-4", policy.archived && "opacity-70")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={scoped(`/hr/communications/policies/${policy.id}`)}
                    className="font-serif text-lg leading-tight text-[#3D421F] hover:underline"
                  >
                    {policy.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-black/45">
                    Version {policy.version} · updated {formatDateOnly(policy.updatedAt)}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton label="Edit policy" onClick={() => setEditing(policy)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label={policy.archived ? "Restore policy" : "Archive policy"}
                      onClick={() => void toggleArchived(policy)}
                    >
                      {policy.archived ? (
                        <ArchiveRestore className="size-3.5" />
                      ) : (
                        <Archive className="size-3.5" />
                      )}
                    </IconButton>
                    {policy.totalSent === 0 ? (
                      <IconButton label="Delete policy" onClick={() => void remove(policy)}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {policy.description ? (
                <p className="text-sm text-black/60">{policy.description}</p>
              ) : null}
              <div className="mt-auto space-y-3">
                {policy.current.sent > 0 ? (
                  <PolicyProgress policy={policy} />
                ) : (
                  <p className="text-xs text-black/45">
                    {policy.totalSent > 0
                      ? `Version ${policy.version} not sent yet.`
                      : "Not sent yet."}
                  </p>
                )}
                <Link
                  href={scoped(`/hr/communications/policies/${policy.id}`)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--venue-primary,#818a40)] hover:underline"
                >
                  {canManage ? "Send & track" : "View acknowledgements"}
                  <ChevronRight className="size-3.5" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <PolicyEditorDialog
          policy={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const created = editing === "new";
            setEditing(null);
            toast.saved(created ? "Policy created." : "Policy saved.");
            if (created) {
              router.push(scoped(`/hr/communications/policies/${saved.id}`));
            } else {
              router.refresh();
            }
          }}
        />
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
    >
      {children}
    </button>
  );
}

function DeliverySettingsCard({
  delivery,
  connectionFromEmail,
  onSaved,
}: {
  delivery: Pick<HrPolicySettings, "recipientField" | "fromEmail">;
  connectionFromEmail: string;
  onSaved: () => void;
}) {
  const [recipientField, setRecipientField] = useState(delivery.recipientField);
  const [fromEmail, setFromEmail] = useState(delivery.fromEmail);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await savePolicyDeliverySettings({ recipientField, fromEmail });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.saved("Delivery settings saved.");
    onSaved();
  }

  return (
    <Card className="grid gap-4 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="policy-recipient">Send to employee email</Label>
        <select
          id="policy-recipient"
          value={recipientField}
          onChange={(e) =>
            setRecipientField(e.target.value as PayslipEmailRecipientField)
          }
          className="flex h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
        >
          <option value="work">Work email</option>
          <option value="personal">Personal email</option>
          <option value="work_then_personal">Work email, fall back to personal</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="policy-from">From email (optional)</Label>
        <Input
          id="policy-from"
          type="email"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder={connectionFromEmail.trim() || "Venue Settings → Email config"}
          className="h-9"
        />
      </div>
      <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </Card>
  );
}
