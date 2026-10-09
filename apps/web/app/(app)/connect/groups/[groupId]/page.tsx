import { Settings } from "lucide-react";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CelebrationsCard } from "@/components/connect/celebrations-card";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { ConnectFrame } from "@/components/connect/connect-frame";
import { ConnectSeenMarker } from "@/components/connect/connect-seen-marker";
import { FeedList } from "@/components/connect/feed-list";
import { GroupBadge } from "@/components/connect/group-icon";
import { PostComposer } from "@/components/connect/post-composer";
import { ScopedLink } from "@/components/layout/scoped-link";
import { composerCelebrationFromParams } from "@/lib/connect/composer-celebration";
import {
  getConnectPageContext,
  loadConnectCelebrations,
} from "@/lib/connect/page-context";
import { roleCanManageGroup, roleCanPost } from "@/lib/connect/permissions";
import { listConnectPosts, listGroupMembers } from "@/lib/connect/store";
import { CONNECT_GROUP_ROLE_LABELS } from "@/lib/connect/types";

const MEMBER_PREVIEW = 12;

export default async function ConnectGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ before?: string; celebrate?: string; kind?: string }>;
}) {
  const { groupId } = await params;
  const query = await searchParams;
  const { service, venue, user, me, groups, seesAllGroups } =
    await getConnectPageContext();

  const group = groups.find((g) => g.id === groupId);
  if (!group) return <AccessDeniedBounce />;

  const basePath = `/connect/groups/${group.id}`;
  const canPost = roleCanPost(group.myRole);

  const [{ posts, nextBefore }, members, celebrations] = await Promise.all([
    listConnectPosts(service, {
      venueId: venue.id,
      groups: [group],
      viewerId: user.id,
      before: query.before ?? null,
      pinnedFirst: true,
    }),
    listGroupMembers(service, group),
    canPost ? loadConnectCelebrations(service, venue) : Promise.resolve([]),
  ]);

  const celebration = composerCelebrationFromParams(query, celebrations);

  return (
    <ConnectFrame
      groups={groups}
      canOpenSettings={seesAllGroups}
      right={
        <>
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="text-[15px] font-semibold text-[#2B2F16]">About</h2>
            <p className="mt-1 text-sm text-black/60">
              {group.description || "No description yet."}
            </p>
            {group.myRole ? (
              <p className="mt-3 text-xs text-black/45">
                Your role: {CONNECT_GROUP_ROLE_LABELS[group.myRole]}
              </p>
            ) : null}
          </section>
          {canPost ? (
            <CelebrationsCard items={celebrations} basePath={basePath} canPost />
          ) : null}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <h2 className="text-[15px] font-semibold text-[#2B2F16]">
              Members · {members.length}
            </h2>
            {members.length === 0 ? (
              <p className="mt-1 text-sm text-black/50">No members yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {members.slice(0, MEMBER_PREVIEW).map((m) => (
                  <li key={m.userId} className="flex items-center gap-2.5">
                    <ConnectAvatar name={m.person.name} photoUrl={m.person.photoUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#2B2F16]">
                        {m.person.name}
                      </span>
                      <span className="block truncate text-xs text-black/50">
                        {m.role === "contributor" || m.role === "viewer"
                          ? (m.person.positionName ?? CONNECT_GROUP_ROLE_LABELS[m.role])
                          : CONNECT_GROUP_ROLE_LABELS[m.role]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      }
    >
      <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div
          className="h-28 sm:h-36"
          style={{
            background: `radial-gradient(circle at 20% 20%, ${group.color}55, transparent 60%), linear-gradient(135deg, ${group.color}, ${group.color}aa)`,
          }}
        />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
          <GroupBadge
            icon={group.icon}
            color={group.color}
            size="lg"
            className="-mt-8 h-20 w-20 rounded-3xl ring-4 ring-white [&>svg]:h-10 [&>svg]:w-10"
          />
          <div className="min-w-0 flex-1 pt-2">
            <h1 className="font-serif text-3xl leading-tight text-[#2B2F16]">{group.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-black/55">
              <span className="flex -space-x-2">
                {members.slice(0, 5).map((m) => (
                  <ConnectAvatar
                    key={m.userId}
                    name={m.person.name}
                    photoUrl={m.person.photoUrl}
                    size="xs"
                  />
                ))}
              </span>
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
          </div>
          {roleCanManageGroup(group.myRole) ? (
            <ScopedLink
              href={`${basePath}/settings`}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--venue-secondary,#F0F3DD)] px-3 py-2 text-sm font-medium text-[#3D421F] hover:opacity-90"
            >
              <Settings className="h-4 w-4" aria-hidden />
              Group settings
            </ScopedLink>
          ) : null}
        </div>
      </section>

      <ConnectSeenMarker groupId={group.id} />
      {canPost && !query.before ? (
        <PostComposer
          me={me}
          groups={[{ id: group.id, name: group.name, color: group.color }]}
          defaultGroupId={group.id}
          celebration={celebration}
          basePath={basePath}
        />
      ) : null}

      <FeedList
        posts={posts}
        me={me}
        showGroup={false}
        nextBefore={nextBefore}
        basePath={basePath}
        emptyMessage={
          canPost
            ? "Nothing here yet. Start the conversation!"
            : "Nothing has been posted in this group yet."
        }
      />
    </ConnectFrame>
  );
}
