"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { saveConnectMembershipRules } from "@/lib/actions/connect";
import {
  CONNECT_DEPARTMENT_RULE_ROLES,
  CONNECT_GROUP_ROLE_LABELS,
  type ConnectAutoMemberRole,
  type ConnectDepartmentRule,
  type ConnectDepartmentRuleRole,
} from "@/lib/connect/types";

type RuleDraft = { key: string; departmentId: string; role: ConnectDepartmentRuleRole };

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] disabled:bg-black/[0.03]";

/** Group setup: who joins automatically, and with which role. */
export function MembershipRulesCard({
  groupId,
  everyoneRole: initialEveryone,
  departmentRules,
  departments,
}: {
  groupId: string;
  everyoneRole: ConnectAutoMemberRole | null;
  departmentRules: ConnectDepartmentRule[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [everyoneRole, setEveryoneRole] = useState<ConnectAutoMemberRole | null>(initialEveryone);
  const [rules, setRules] = useState<RuleDraft[]>(() =>
    departmentRules.map((r) => ({ key: r.departmentId, departmentId: r.departmentId, role: r.role })),
  );

  const used = new Set(rules.map((r) => r.departmentId));
  const nextFree = departments.find((d) => !used.has(d.id));
  const dirty =
    everyoneRole !== initialEveryone ||
    JSON.stringify(rules.map(({ departmentId, role }) => ({ departmentId, role }))) !==
      JSON.stringify(departmentRules.map(({ departmentId, role }) => ({ departmentId, role })));

  function save() {
    if (rules.some((r) => !r.departmentId)) {
      toast.alert("Choose a department for each rule, or remove the empty one.");
      return;
    }
    startTransition(async () => {
      const result = await saveConnectMembershipRules({
        groupId,
        everyoneRole,
        departments: rules.map(({ departmentId, role }) => ({ departmentId, role })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Membership rules saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-black/5 bg-[#F9FAF5] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#3D421F] shadow-sm">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="font-medium text-[#2B2F16]">All staff</p>
              <p className="text-sm text-black/55">
                Every employee with a Hub login at this venue joins automatically — including new
                staff as soon as they get a login.
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="All staff">
              {(
                [
                  [null, "Off"],
                  ["viewer", "Add as Viewer"],
                  ["contributor", "Add as Contributor"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={everyoneRole === value}
                  disabled={pending}
                  onClick={() => setEveryoneRole(value)}
                  className={
                    everyoneRole === value
                      ? "rounded-full bg-[#3D421F] px-3.5 py-1.5 text-sm font-medium text-white"
                      : "rounded-full bg-white px-3.5 py-1.5 text-sm text-black/65 ring-1 ring-black/10 hover:bg-black/5"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-black/5 bg-[#F9FAF5] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#3D421F] shadow-sm">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="font-medium text-[#2B2F16]">By department</p>
              <p className="text-sm text-black/55">
                Employees in these HR departments join automatically. Uses the department on their
                staff record, so their Hub login must be linked to it.
              </p>
            </div>

            {rules.length === 0 ? (
              <p className="text-sm text-black/45">No department rules.</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((rule, index) => (
                  <li key={rule.key} className="flex flex-wrap items-center gap-2">
                    <select
                      value={rule.departmentId}
                      disabled={pending}
                      onChange={(e) =>
                        setRules((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, departmentId: e.target.value } : r,
                          ),
                        )
                      }
                      className={`${selectClass} min-w-0 flex-1`}
                      aria-label="Department"
                    >
                      <option value="">Choose department…</option>
                      {departments.map((d) => (
                        <option
                          key={d.id}
                          value={d.id}
                          disabled={used.has(d.id) && d.id !== rule.departmentId}
                        >
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-black/45">as</span>
                    <select
                      value={rule.role}
                      disabled={pending}
                      onChange={(e) =>
                        setRules((prev) =>
                          prev.map((r, i) =>
                            i === index
                              ? { ...r, role: e.target.value as ConnectDepartmentRuleRole }
                              : r,
                          ),
                        )
                      }
                      className={selectClass}
                      aria-label="Role for this department"
                    >
                      {CONNECT_DEPARTMENT_RULE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {CONNECT_GROUP_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))}
                      className="rounded-md p-2 text-black/40 hover:bg-red-50 hover:text-red-700"
                      aria-label="Remove department rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || !nextFree}
              onClick={() =>
                setRules((prev) => [
                  ...prev,
                  {
                    key: `new-${Date.now()}`,
                    departmentId: nextFree?.id ?? "",
                    role: "contributor",
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add department
            </Button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-black/50">
          When several rules match someone, they get the highest role. A role you set by hand under
          Members always wins.
        </p>
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save rules"}
        </Button>
      </div>
    </div>
  );
}
