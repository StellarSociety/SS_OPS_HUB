import { redirect } from "next/navigation";
import Image from "next/image";
import {
  Briefcase,
  Building2,
  Layers,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { ModuleIcon } from "@/components/modules/module-icon";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { UserAccessLogs } from "@/components/settings/user-access-logs";
import {
  accountRoleLabel,
  appRoleLabel,
  buildEditorState,
} from "@/lib/access/roles";
import { listAccessEvents } from "@/lib/access/store";
import type { ModuleAccessRecord, UserListRow } from "@/lib/access/types";
import { getModuleLabel } from "@/lib/modules-catalog";
import { getModuleEntryHref, getOverviewModuleByKey } from "@/lib/modules-registry";
import { createClient } from "@/lib/supabase/server";
import { getUserInitials } from "@/lib/user/display";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { Card } from "@/components/ui/card";

async function loadOwnModuleAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ModuleAccessRecord[]> {
  try {
    const { data, error } = await supabase
      .from("user_module_access")
      .select("id, venue_id, module_key, role, enabled, suspended")
      .eq("user_id", userId);
    if (error) return [];
    return (data ?? []) as ModuleAccessRecord[];
  } catch {
    return [];
  }
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const STAFF_JOIN = `
      staff:staff_id (
        emp_no, first_name, full_name, work_email, personal_email, photo_url,
        department:department_id ( name ),
        position:position_id ( name ),
        home_venue:home_venue_id ( name )
      )`;

  let profile: Record<string, unknown> | null = null;
  const selects = [
    `id, email, full_name, status, is_external, last_login_at, avatar_url,${STAFF_JOIN}`,
    `id, email, full_name, status, is_external, last_login_at,${STAFF_JOIN}`,
    `id, email, full_name, status,${STAFF_JOIN}`,
  ];
  for (const select of selects) {
    const result = await supabase
      .from("profiles")
      .select(select)
      .eq("id", user.id)
      .maybeSingle();
    if (!result.error) {
      profile = (result.data ?? null) as Record<string, unknown> | null;
      break;
    }
  }

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("id, venue_id, module_key, feature_key, access_level")
    .eq("user_id", user.id);

  const moduleAccess = await loadOwnModuleAccess(supabase, user.id);
  const events = await listAccessEvents(supabase, user.id, 25);

  const unwrap = <T,>(value: T | T[] | null | undefined): T | null => {
    if (value == null) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
  };

  type Named = { name: string } | { name: string }[] | null;
  type StaffShape = {
    emp_no: string;
    work_email: string | null;
    personal_email: string | null;
    photo_url?: string | null;
    department: Named;
    position: Named;
    home_venue: Named;
  };
  type ProfileShape = {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    staff?: StaffShape | StaffShape[] | null;
  };

  const p = profile as ProfileShape | null;
  const staffRaw = unwrap(p?.staff);
  const staff = staffRaw
    ? {
        emp_no: staffRaw.emp_no,
        work_email: staffRaw.work_email,
        personal_email: staffRaw.personal_email,
        photo_url: staffRaw.photo_url ?? null,
        department: unwrap(staffRaw.department),
        position: unwrap(staffRaw.position),
        home_venue: unwrap(staffRaw.home_venue),
      }
    : null;
  const fullName = p?.full_name ?? user.email ?? "User";
  const email = p?.email ?? user.email ?? "";
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = resolveAvatarUrl({
    profileAvatarUrl: p?.avatar_url,
    staffPhotoUrl: staff?.photo_url ?? null,
    userMetadata: metadata,
  });

  const editorState = buildEditorState({
    moduleAccess,
    permissions: (permissions ?? []) as UserListRow["permissions"],
  } as UserListRow);

  const enabledModules = editorState.modules.filter((m) => m.enabled);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        {avatarUrl ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-black/10 shadow-sm">
            <Image
              src={avatarUrl}
              alt={fullName}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#3D421F] font-serif text-2xl text-[#F0F3DD]">
            {getUserInitials(fullName, email)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl text-[#3D421F]">{fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-black/60">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-black/40" /> {email}
            </span>
            {staff?.position?.name ? (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-black/40" />
                {staff.position.name}
              </span>
            ) : null}
            {staff?.home_venue?.name ? (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-black/40" />
                {staff.home_venue.name}
              </span>
            ) : null}
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--venue-secondary)]/60 px-3 py-1 text-xs font-medium text-[#3D421F]">
              <ShieldCheck className="h-3.5 w-3.5" />
              {accountRoleLabel(editorState.accountRole)}
            </span>
          </div>
        </div>
      </Card>

      {/* Staff details */}
      {staff ? (
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">Staff details</h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-black/40">Employee no.</dt>
              <dd className="text-[#3D421F]">{staff.emp_no}</dd>
            </div>
            <div>
              <dt className="text-xs text-black/40">Department</dt>
              <dd className="text-[#3D421F]">
                {staff.department?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-black/40">Work email</dt>
              <dd className="text-[#3D421F]">{staff.work_email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-black/40">Personal email</dt>
              <dd className="text-[#3D421F]">{staff.personal_email ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-xs text-black/40">
            To update your staff details, contact your venue administrator.
          </p>
        </Card>
      ) : null}

      {/* App access */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-[#818a40]" />
          <h2 className="font-serif text-xl text-[#3D421F]">My app access</h2>
        </div>
        {enabledModules.length === 0 ? (
          <p className="text-sm text-black/50">
            No apps assigned yet. Your administrator controls your access.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {enabledModules.map((m) => {
              const overview = getOverviewModuleByKey(m.moduleKey);
              const label = getModuleLabel(m.moduleKey);
              const href = m.suspended ? null : getModuleEntryHref(m.moduleKey);
              return (
              <div
                key={m.moduleKey}
                className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--venue-secondary)]/60 text-[#3D421F]">
                    <ModuleIcon
                      iconKey={overview?.iconKey ?? "settings"}
                      className="h-5 w-5"
                    />
                  </span>
                  <div className="min-w-0">
                    {href ? (
                      <Link
                        href={href}
                        className="block truncate text-sm font-medium text-[#3D421F] underline-offset-2 transition-colors hover:text-[#818a40] hover:underline"
                      >
                        {label}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium text-[#3D421F]">
                        {label}
                      </p>
                    )}
                    <p className="text-xs text-black/50">{appRoleLabel(m.role)}</p>
                  </div>
                </div>
                {m.suspended ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">
                    <Lock className="h-3 w-3" /> Blocked
                  </span>
                ) : null}
              </div>
            );
            })}
          </div>
        )}
      </Card>

      <UserAccessLogs events={events} />
    </div>
  );
}
