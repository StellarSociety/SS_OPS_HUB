import type { SupabaseClient } from "@supabase/supabase-js";
import { listUsers } from "@/lib/access/store";
import { canAccessHiring } from "@/lib/hr/permissions";
import { dispatchPendingPushes } from "@/lib/push/send";

export type HiringNotifyCandidate = {
  id: string;
  label: string;
  searchText: string;
};

function candidateLabel(user: {
  email: string;
  full_name: string | null;
  staff: { full_name: string } | null;
}): string {
  return user.staff?.full_name?.trim() || user.full_name?.trim() || user.email;
}

export async function listHiringNotifyCandidates(
  service: SupabaseClient,
  venueId: string,
): Promise<HiringNotifyCandidate[]> {
  const users = await listUsers(service);
  return users
    .filter((user) => {
      if (user.status === "disabled") return false;
      const permissions = user.permissions.map((permission) => ({
        ...permission,
        user_id: user.id,
      }));
      return canAccessHiring(permissions, venueId);
    })
    .map((user) => ({
      id: user.id,
      label: candidateLabel(user),
      searchText: [user.email, user.staff?.emp_no, user.staff?.department?.name]
        .filter(Boolean)
        .join(" "),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export async function notifyHiringApplicationSubmitted(
  service: SupabaseClient,
  params: {
    venueId: string;
    formId: string;
    formName: string;
    applicationId: string;
    applicantName: string | null;
    notifyUserIds: string[];
  },
): Promise<void> {
  try {
    const ids = [
      ...new Set(params.notifyUserIds.filter((id) => id.trim().length > 0)),
    ];
    if (ids.length === 0) return;

    const who = params.applicantName?.trim() || "A candidate";
    const formName = params.formName.trim() || "a hiring form";
    const rows = ids.map((userId) => ({
      user_id: userId,
      venue_id: params.venueId,
      module_key: "hr",
      type: "hiring_application_submitted",
      title: `New application — ${formName}`,
      body: `${who} submitted ${formName}.`,
      entity: "hiring_form",
      entity_id: params.formId,
      severity: "info" as const,
      dedupe_key: `hiring-application:${params.venueId}:${params.applicationId}:${userId}`,
      read_at: null,
      push_sent_at: null,
    }));

    const { error } = await service.from("notifications").upsert(rows, {
      onConflict: "dedupe_key",
    });
    if (error) {
      console.error("[hiring] notify failed:", error.message);
      return;
    }
    await dispatchPendingPushes(service);
  } catch (error) {
    console.error("[hiring] notify failed:", error);
  }
}
