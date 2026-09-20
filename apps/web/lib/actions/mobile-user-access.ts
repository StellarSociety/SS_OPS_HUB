"use server";

import { revalidatePath } from "next/cache";
import { requireAppAdmin } from "@/lib/access/permissions";
import {
  persistDueAccessBlock,
} from "@/lib/access/access-block-store";
import { isAccessBlockDue } from "@/lib/access/access-block";
import {
  applyMatrixLevel,
  employeeHubLevelFromState,
  ensureMobileAppEnabled,
  getAccessMatrixAppColumns,
  matrixLevelFromConfig,
  webAppAccessCount,
  type AccessMatrixLevel,
  MOBILE_EMPLOYEE_HUB_MODULE_KEY,
} from "@/lib/access/matrix";
import { buildEditorState } from "@/lib/access/roles";
import { getUserById, listUsers, staffInviteEmail } from "@/lib/access/store";
import { inviteStatusOf, type InviteStatus } from "@/lib/access/types";
import { inviteUser, saveUserAccess, suspendAllAccess } from "@/lib/actions/users";
import { isOutEmploymentStatus } from "@/lib/hr/employment-status";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canManageHubSettings } from "@/lib/role-permissions";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserListRow } from "@/lib/access/types";

export type MobileAccessMatrixRow = {
  key: string;
  kind: "staff" | "external";
  staffId: string | null;
  userId: string | null;
  name: string;
  empNo: string | null;
  photoUrl: string | null;
  position: string | null;
  department: string;
  departmentSort: number;
  employmentStatus: string | null;
  terminationDate: string | null;
  inviteStatus: InviteStatus | "none";
  hasEmail: boolean;
  email: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  invitedAt: string | null;
  inviteAcceptedAt: string | null;
  lastLoginAt: string | null;
  webAppCount: number;
  levels: Record<string, AccessMatrixLevel>;
  blockedNow: boolean;
  accessBlockedUntil: string | null;
  accessBlockFromTermination: boolean;
};

export type MobileAccessMatrixData = {
  apps: ReturnType<typeof getAccessMatrixAppColumns>;
  hubKey: string;
  active: MobileAccessMatrixRow[];
  out: MobileAccessMatrixRow[];
  external: MobileAccessMatrixRow[];
  canEdit: boolean;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function emptyLevels(apps: { key: string }[]): Record<string, AccessMatrixLevel> {
  const levels: Record<string, AccessMatrixLevel> = {
    [MOBILE_EMPLOYEE_HUB_MODULE_KEY]: "none",
  };
  for (const app of apps) levels[app.key] = "none";
  return levels;
}

function levelsFromUser(
  user: UserListRow,
  apps: { key: string }[],
): { levels: Record<string, AccessMatrixLevel>; webAppCount: number } {
  const state = buildEditorState(user);
  const byKey = new Map(state.modules.map((mod) => [mod.moduleKey, mod]));
  const levels = emptyLevels(apps);
  levels[MOBILE_EMPLOYEE_HUB_MODULE_KEY] = employeeHubLevelFromState(state.modules);
  for (const app of apps) {
    levels[app.key] = matrixLevelFromConfig(byKey.get(app.key));
  }
  return { levels, webAppCount: webAppAccessCount(state.modules) };
}

function staffRowFromUser(
  user: UserListRow,
  apps: { key: string }[],
  extra: {
    key: string;
    kind: "staff" | "external";
    staffId: string | null;
    name: string;
    empNo: string | null;
    photoUrl: string | null;
    position: string | null;
    department: string;
    departmentSort: number;
    employmentStatus: string | null;
    terminationDate: string | null;
    hasEmail: boolean;
    email: string | null;
    workEmail: string | null;
    personalEmail: string | null;
  },
): MobileAccessMatrixRow {
  const { levels, webAppCount } = levelsFromUser(user, apps);
  return {
    ...extra,
    userId: user.id,
    inviteStatus: inviteStatusOf(user),
    email: user.email,
    invitedAt: user.invited_at,
    inviteAcceptedAt: user.invite_accepted_at,
    lastLoginAt: user.last_login_at,
    webAppCount,
    levels,
    blockedNow: user.status === "disabled" || isAccessBlockDue(user.access_blocked_until),
    accessBlockedUntil: user.access_blocked_until,
    accessBlockFromTermination: user.access_block_from_termination,
  };
}

export async function listMobileAccessMatrix(): Promise<MobileAccessMatrixData> {
  const { permissions, venue } = await getMobilePageContext();
  const apps = getAccessMatrixAppColumns();
  const empty: MobileAccessMatrixData = {
    apps,
    hubKey: MOBILE_EMPLOYEE_HUB_MODULE_KEY,
    active: [],
    out: [],
    external: [],
    canEdit: false,
  };

  if (!canAccessMobileApp(permissions, venue.id)) return empty;

  const service = createServiceClient();
  const [users, staffResult] = await Promise.all([
    listUsers(service),
    service
      .from("staff")
      .select(
        `
        id,
        emp_no,
        first_name,
        full_name,
        photo_url,
        work_email,
        personal_email,
        termination_date,
        department:departments(id, name, sort_order),
        position:positions(name),
        employment_status:employment_statuses(name)
      `,
      )
      .eq("home_venue_id", venue.id)
      .eq("org_chart_only", false)
      .order("full_name"),
  ]);

  const userByStaffId = new Map(
    users.filter((user) => user.staff_id).map((user) => [user.staff_id!, user]),
  );

  const active: MobileAccessMatrixRow[] = [];
  const out: MobileAccessMatrixRow[] = [];

  for (const raw of staffResult.data ?? []) {
    const department = unwrapOne(
      raw.department as
        | { id: string; name: string; sort_order: number }
        | { id: string; name: string; sort_order: number }[]
        | null,
    );
    const position = unwrapOne(raw.position as { name: string } | { name: string }[] | null);
    const status = unwrapOne(
      raw.employment_status as { name: string } | { name: string }[] | null,
    );
    const user = userByStaffId.get(raw.id as string) ?? null;
    const terminationDate = raw.termination_date
      ? String(raw.termination_date).slice(0, 10)
      : null;
    const extra = {
      key: `staff:${raw.id}`,
      kind: "staff" as const,
      staffId: raw.id as string,
      name: String(raw.full_name ?? "").trim() || "Unnamed",
      empNo: raw.emp_no ? String(raw.emp_no) : null,
      photoUrl: (raw.photo_url as string | null) ?? user?.avatar_url ?? null,
      position: position?.name ?? null,
      department: department?.name?.trim() || "No department",
      departmentSort: department?.sort_order ?? 999,
      employmentStatus: status?.name ?? null,
      terminationDate,
      hasEmail: Boolean(staffInviteEmail(raw)),
      email: user?.email ?? staffInviteEmail(raw),
      workEmail: raw.work_email ? String(raw.work_email).trim() : null,
      personalEmail: raw.personal_email ? String(raw.personal_email).trim() : null,
    };

    const row: MobileAccessMatrixRow = user
      ? staffRowFromUser(user, apps, extra)
      : {
          ...extra,
          userId: null,
          inviteStatus: "none",
          invitedAt: null,
          inviteAcceptedAt: null,
          lastLoginAt: null,
          webAppCount: 0,
          levels: emptyLevels(apps),
          blockedNow: false,
          accessBlockedUntil: terminationDate,
          accessBlockFromTermination: true,
        };

    if (isOutEmploymentStatus(status?.name)) out.push(row);
    else active.push(row);
  }

  const venueStaffIds = new Set(active.concat(out).map((row) => row.staffId));
  const listedUserIds = new Set(
    active.concat(out).map((row) => row.userId).filter((id): id is string => Boolean(id)),
  );
  const external = users
    .filter((user) => {
      if (listedUserIds.has(user.id)) return false;
      if (user.staff_id && venueStaffIds.has(user.staff_id)) return false;
      return true;
    })
    .map((user) =>
      staffRowFromUser(user, apps, {
        key: `user:${user.id}`,
        kind: "external",
        staffId: user.staff_id,
        name: user.full_name?.trim() || user.email,
        empNo: user.staff?.emp_no ?? null,
        photoUrl: user.staff?.photo_url ?? user.avatar_url,
        position: user.is_external
          ? null
          : user.staff?.position?.name ??
            user.staff?.home_venue?.name ??
            null,
        department: "External users",
        departmentSort: 0,
        employmentStatus: user.staff?.employment_status?.name ?? null,
        terminationDate: null,
        hasEmail: Boolean(user.email),
        email: user.email,
        workEmail: user.staff?.work_email ?? null,
        personalEmail: user.staff?.personal_email ?? null,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    apps,
    hubKey: MOBILE_EMPLOYEE_HUB_MODULE_KEY,
    active,
    out,
    external,
    canEdit: canManageHubSettings(permissions),
  };
}

function revalidateMatrix() {
  revalidatePath("/mobile/access");
  revalidatePath("/settings/users");
}

export async function setMobileMatrixAccess(input: {
  userId: string;
  moduleKey: string;
  level: AccessMatrixLevel;
}) {
  await requireAppAdmin();
  const { venue } = await getMobilePageContext();
  const service = createServiceClient();
  const target = await getUserById(service, input.userId);
  if (!target) return { error: "User not found." };

  const state = buildEditorState(target);
  const granted = input.level === "viewer" || input.level === "editor";
  let modules = state.modules.map((mod) =>
    mod.moduleKey === input.moduleKey
      ? applyMatrixLevel(mod, input.level, venue.id)
      : mod,
  );
  if (granted) modules = ensureMobileAppEnabled(modules, venue.id);

  const result = await saveUserAccess(input.userId, { ...state, modules });
  revalidateMatrix();
  return result;
}

export async function inviteStaffFromMatrix(
  staffId: string,
  options: {
    emailSource?: "work" | "personal";
    sendEmail?: boolean;
    password?: string;
  } = {},
) {
  const result = await inviteUser(staffId, options);
  revalidateMatrix();
  return result;
}

export async function setMobileAccessBlock(input: {
  userId: string;
  blockedNow: boolean;
  until: string | null;
  fromTermination: boolean;
}) {
  const { user: actor } = await requireAppAdmin();
  if (actor.id === input.userId && input.blockedNow) {
    return { error: "You cannot suspend your own account." };
  }

  const service = createServiceClient();
  const target = await getUserById(service, input.userId);
  if (!target) return { error: "User not found." };

  let until = input.until?.trim().slice(0, 10) || null;
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return { error: "Enter a valid block date." };
  }

  if (input.fromTermination && target.staff_id) {
    const { data: staff } = await service
      .from("staff")
      .select("termination_date")
      .eq("id", target.staff_id)
      .maybeSingle();
    until = staff?.termination_date
      ? String(staff.termination_date).slice(0, 10)
      : until;
  }

  const { error } = await service
    .from("profiles")
    .update({
      access_blocked_until: until,
      access_block_from_termination: input.fromTermination,
    })
    .eq("id", input.userId);
  if (error) return { error: error.message };

  const due = isAccessBlockDue(until);
  if (input.blockedNow || due) {
    const result = await suspendAllAccess(input.userId, true);
    if (result.error) return result;
  } else {
    const result = await suspendAllAccess(input.userId, false);
    if (result.error) return result;
  }

  revalidateMatrix();
  return { success: "Access block updated." };
}

export async function enforceDueAccessBlockForUser(userId: string) {
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("status, access_blocked_until")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return;
  await persistDueAccessBlock(service, userId, profile);
}
