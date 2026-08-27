import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_FORM_INTRO,
  DEFAULT_FORM_TITLE,
  DEFAULT_FROM_EMAIL,
  DEFAULT_FROM_NAME,
  DEFAULT_REWARDS,
  DEFAULT_THANK_YOU,
  DEFAULT_VALID_DAYS,
  type GuestSource,
  type GuestsIntelGuest,
  type GuestsIntelGuestRow,
  type GuestsIntelIssue,
  type GuestsIntelReward,
  type GuestsIntelSettings,
  type IssueStatus,
  type RewardKind,
} from "./types";
import { newPublicToken } from "./qr";

type AnyClient = SupabaseClient;

function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function asSettings(row: Record<string, unknown>): GuestsIntelSettings {
  return {
    venue_id: String(row.venue_id),
    public_token: String(row.public_token),
    from_email: String(row.from_email ?? DEFAULT_FROM_EMAIL),
    from_name: String(row.from_name ?? DEFAULT_FROM_NAME),
    form_title: String(row.form_title ?? DEFAULT_FORM_TITLE),
    form_intro: String(row.form_intro ?? DEFAULT_FORM_INTRO),
    thank_you_message: String(row.thank_you_message ?? DEFAULT_THANK_YOU),
    email_subject: String(row.email_subject ?? "Your {{venue}} guest pass"),
    default_reward_id: row.default_reward_id
      ? String(row.default_reward_id)
      : null,
    public_form_enabled: Boolean(row.public_form_enabled ?? true),
    valid_days: Number(row.valid_days ?? DEFAULT_VALID_DAYS) || DEFAULT_VALID_DAYS,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asReward(row: Record<string, unknown>): GuestsIntelReward {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    kind: String(row.kind) as RewardKind,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    value_label: row.value_label ? String(row.value_label) : null,
    terms: row.terms ? String(row.terms) : null,
    valid_days:
      row.valid_days == null || row.valid_days === ""
        ? null
        : Number(row.valid_days),
    active: Boolean(row.active),
    archived_at: row.archived_at ? String(row.archived_at) : null,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asGuest(row: Record<string, unknown>): GuestsIntelGuest {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    source: String(row.source) as GuestSource,
    first_name: String(row.first_name),
    last_name: row.last_name ? String(row.last_name) : null,
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    visit_date: row.visit_date ? String(row.visit_date) : null,
    birth_anniversary: row.birth_anniversary
      ? String(row.birth_anniversary)
      : null,
    allergens: asTextArray(row.allergens),
    other_diets: asTextArray(row.other_diets),
    notes: row.notes ? String(row.notes) : null,
    marketing_opt_in: Boolean(row.marketing_opt_in),
    submitted_by: row.submitted_by ? String(row.submitted_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asIssue(row: Record<string, unknown>): GuestsIntelIssue {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    guest_id: String(row.guest_id),
    reward_id: String(row.reward_id),
    code: String(row.code),
    status: String(row.status) as IssueStatus,
    issued_at: String(row.issued_at),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    redeemed_at: row.redeemed_at ? String(row.redeemed_at) : null,
    redeemed_by: row.redeemed_by ? String(row.redeemed_by) : null,
    email_sent_at: row.email_sent_at ? String(row.email_sent_at) : null,
    email_error: row.email_error ? String(row.email_error) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listRewards(
  client: AnyClient,
  venueId: string,
  options?: { includeArchived?: boolean; activeOnly?: boolean },
): Promise<GuestsIntelReward[]> {
  let query = client
    .from("guests_intel_rewards")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (options?.activeOnly) {
    query = query.eq("active", true).is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => asReward(row as Record<string, unknown>));
}

export async function getReward(
  client: AnyClient,
  id: string,
): Promise<GuestsIntelReward | null> {
  const { data, error } = await client
    .from("guests_intel_rewards")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? asReward(data as Record<string, unknown>) : null;
}

export async function ensureVenueDefaults(
  client: AnyClient,
  venueId: string,
  venueName: string,
  venueSlug: string,
): Promise<GuestsIntelSettings> {
  const existing = await getSettings(client, venueId);
  if (existing) {
    const rewards = await listRewards(client, venueId, { includeArchived: true });
    if (rewards.length === 0) {
      await seedRewards(client, venueId);
    }
    if (!existing.default_reward_id) {
      const active = await listRewards(client, venueId, { activeOnly: true });
      if (active[0]) {
        await client
          .from("guests_intel_settings")
          .update({ default_reward_id: active[0].id })
          .eq("venue_id", venueId);
        return { ...existing, default_reward_id: active[0].id };
      }
    }
    return existing;
  }

  const fromName =
    venueSlug === "orilla" ? DEFAULT_FROM_NAME : `${venueName} Reservations`;
  const { data, error } = await client
    .from("guests_intel_settings")
    .insert({
      venue_id: venueId,
      public_token: newPublicToken(),
      from_email: DEFAULT_FROM_EMAIL,
      from_name: fromName,
    })
    .select("*")
    .single();
  if (error) throw error;

  const rewards = await seedRewards(client, venueId);
  const defaultReward = rewards[0] ?? null;
  if (defaultReward) {
    await client
      .from("guests_intel_settings")
      .update({ default_reward_id: defaultReward.id })
      .eq("venue_id", venueId);
  }

  return asSettings({
    ...(data as Record<string, unknown>),
    default_reward_id: defaultReward?.id ?? null,
  });
}

async function seedRewards(
  client: AnyClient,
  venueId: string,
): Promise<GuestsIntelReward[]> {
  const { data, error } = await client
    .from("guests_intel_rewards")
    .insert(
      DEFAULT_REWARDS.map((reward) => ({
        venue_id: venueId,
        kind: reward.kind,
        title: reward.title,
        description: reward.description,
        value_label: reward.value_label,
        sort_order: reward.sort_order,
        active: true,
      })),
    )
    .select("*");
  if (error) throw error;
  return (data ?? []).map((row) => asReward(row as Record<string, unknown>));
}

export async function getSettings(
  client: AnyClient,
  venueId: string,
): Promise<GuestsIntelSettings | null> {
  const { data, error } = await client
    .from("guests_intel_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw error;
  return data ? asSettings(data as Record<string, unknown>) : null;
}

export async function getSettingsByToken(
  client: AnyClient,
  token: string,
): Promise<GuestsIntelSettings | null> {
  const { data, error } = await client
    .from("guests_intel_settings")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? asSettings(data as Record<string, unknown>) : null;
}

export async function listGuests(
  client: AnyClient,
  venueId: string,
): Promise<GuestsIntelGuestRow[]> {
  const { data: guests, error } = await client
    .from("guests_intel_guests")
    .select("*")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw error;

  const rows = (guests ?? []).map((row) => asGuest(row as Record<string, unknown>));
  if (rows.length === 0) return [];

  const ids = rows.map((guest) => guest.id);
  const { data: issues, error: issueError } = await client
    .from("guests_intel_issues")
    .select("*")
    .in("guest_id", ids)
    .order("issued_at", { ascending: false });
  if (issueError) throw issueError;

  const issueRows = (issues ?? []).map((row) =>
    asIssue(row as Record<string, unknown>),
  );
  const latestByGuest = new Map<string, GuestsIntelIssue>();
  for (const issue of issueRows) {
    if (!latestByGuest.has(issue.guest_id)) {
      latestByGuest.set(issue.guest_id, issue);
    }
  }

  const rewardIds = [
    ...new Set(
      [...latestByGuest.values()].map((issue) => issue.reward_id).filter(Boolean),
    ),
  ];
  const rewards =
    rewardIds.length === 0
      ? []
      : ((
          await client.from("guests_intel_rewards").select("*").in("id", rewardIds)
        ).data ?? []);
  const rewardMap = new Map(
    rewards.map((row) => {
      const reward = asReward(row as Record<string, unknown>);
      return [reward.id, reward] as const;
    }),
  );

  return rows.map((guest) => {
    const latest = latestByGuest.get(guest.id) ?? null;
    const reward = latest ? rewardMap.get(latest.reward_id) ?? null : null;
    return {
      ...guest,
      latest_issue: latest,
      reward_title: reward?.title ?? null,
      reward_kind: reward?.kind ?? null,
      reward_value_label: reward?.value_label ?? null,
    };
  });
}

export async function getIssueByCode(
  client: AnyClient,
  code: string,
): Promise<{
  issue: GuestsIntelIssue;
  guest: GuestsIntelGuest;
  reward: GuestsIntelReward;
} | null> {
  const raw = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length < 8) return null;
  const normalized = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;

  const { data, error } = await client
    .from("guests_intel_issues")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const issue = asIssue(data as Record<string, unknown>);
  const [{ data: guestRow }, { data: rewardRow }] = await Promise.all([
    client.from("guests_intel_guests").select("*").eq("id", issue.guest_id).maybeSingle(),
    client.from("guests_intel_rewards").select("*").eq("id", issue.reward_id).maybeSingle(),
  ]);
  if (!guestRow || !rewardRow) return null;

  return {
    issue,
    guest: asGuest(guestRow as Record<string, unknown>),
    reward: asReward(rewardRow as Record<string, unknown>),
  };
}

export async function countDashboard(
  client: AnyClient,
  venueId: string,
): Promise<{
  guestsTotal: number;
  guestsThisMonth: number;
  issuedOpen: number;
  redeemed: number;
}> {
  const start = new Date();
  const fromIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;

  const [allGuests, monthGuests, openIssues, redeemedIssues] = await Promise.all([
    client
      .from("guests_intel_guests")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId),
    client
      .from("guests_intel_guests")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .gte("created_at", fromIso),
    client
      .from("guests_intel_issues")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("status", "issued"),
    client
      .from("guests_intel_issues")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("status", "redeemed"),
  ]);

  return {
    guestsTotal: allGuests.count ?? 0,
    guestsThisMonth: monthGuests.count ?? 0,
    issuedOpen: openIssues.count ?? 0,
    redeemed: redeemedIssues.count ?? 0,
  };
}
