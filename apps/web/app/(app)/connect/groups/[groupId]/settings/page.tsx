import { ArrowLeft } from "lucide-react";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import {
  GroupDetailsForm,
  GroupMembersEditor,
  RoleLegend,
} from "@/components/connect/group-settings-panel";
import { MembershipRulesCard } from "@/components/connect/membership-rules-card";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { getConnectPageContext } from "@/lib/connect/page-context";
import { roleCanManageGroup } from "@/lib/connect/permissions";
import {
  listGroupMembers,
  listVenueAppUsers,
  listVenueDepartments,
} from "@/lib/connect/store";

export default async function ConnectGroupSettingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { service, venue, groups, isConnectAdmin } = await getConnectPageContext();

  const group = groups.find((g) => g.id === groupId);
  if (!group || !roleCanManageGroup(group.myRole)) return <AccessDeniedBounce />;

  const [members, candidates, departments] = await Promise.all([
    listGroupMembers(service, group),
    listVenueAppUsers(service, venue.id),
    listVenueDepartments(service, venue.id),
  ]);
  const hasAutoRules = Boolean(group.autoMemberRole) || group.departmentRules.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <ScopedLink
          href={isConnectAdmin ? "/connect/settings" : `/connect/chats/feed/${group.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-black/55 hover:text-black/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {isConnectAdmin ? "All groups" : group.name}
        </ScopedLink>
        <h1 className="mt-2 font-serif text-3xl text-[#3D421F]">{group.name} · Settings</h1>
        <p className="mt-1 text-sm text-black/60">
          Group details and who can do what in this group.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-[#2B2F16]">Details</h2>
        <GroupDetailsForm
          initial={{
            id: group.id,
            name: group.name,
            description: group.description,
            icon: group.icon,
            color: group.color,
          }}
          submitLabel="Save details"
        />
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-[#2B2F16]">Automatic membership</h2>
          <p className="mt-1 text-sm text-black/55">
            Add staff to this group automatically, and choose their role.
          </p>
        </div>
        <MembershipRulesCard
          key={`${group.autoMemberRole}-${group.departmentRules.map((r) => r.departmentId + r.role).join()}`}
          groupId={group.id}
          everyoneRole={group.autoMemberRole}
          departmentRules={group.departmentRules}
          departments={departments}
        />
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-[#2B2F16]">Members &amp; rights</h2>
          <p className="mt-1 text-sm text-black/55">
            Everyone in the group, and their role. Change a role here to override the automatic
            one (e.g. make someone a moderator).
          </p>
        </div>
        <RoleLegend />
        <GroupMembersEditor
          groupId={group.id}
          members={members}
          candidates={candidates}
          hasAutoRules={hasAutoRules}
        />
      </Card>
    </div>
  );
}
