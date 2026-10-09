export const CONNECT_MODULE_KEY = "team_connect" as const;

export const CONNECT_FEATURES = {
  feed: "feed",
  settings: "settings",
} as const;

export const CONNECT_BUCKET = "connect-media";

export const CONNECT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CONNECT_MAX_ATTACHMENTS = 10;
export const CONNECT_POSTS_PAGE_SIZE = 20;

export const CONNECT_GROUP_ROLES = [
  "admin",
  "moderator",
  "contributor",
  "viewer",
] as const;

export type ConnectGroupRole = (typeof CONNECT_GROUP_ROLES)[number];

export const CONNECT_AUTO_MEMBER_ROLES = ["viewer", "contributor"] as const;

export type ConnectAutoMemberRole = (typeof CONNECT_AUTO_MEMBER_ROLES)[number];

export const CONNECT_DEPARTMENT_RULE_ROLES = ["moderator", "contributor", "viewer"] as const;

export type ConnectDepartmentRuleRole = (typeof CONNECT_DEPARTMENT_RULE_ROLES)[number];

export type ConnectDepartmentRule = {
  departmentId: string;
  departmentName: string;
  role: ConnectDepartmentRuleRole;
};

export const CONNECT_GROUP_ROLE_LABELS: Record<ConnectGroupRole, string> = {
  admin: "Group Admin",
  moderator: "Group Moderator",
  contributor: "Contributor",
  viewer: "Viewer",
};

export const CONNECT_GROUP_ROLE_HINTS: Record<ConnectGroupRole, string> = {
  admin: "Manages group settings and members, posts and moderates.",
  moderator: "Posts, pins, and removes anyone's posts or comments.",
  contributor: "Creates posts, comments and reacts.",
  viewer: "Reads, comments and reacts — cannot start posts.",
};

export const CONNECT_REACTIONS = [
  "like",
  "love",
  "celebrate",
  "laugh",
  "wow",
] as const;

export type ConnectReaction = (typeof CONNECT_REACTIONS)[number];

export const CONNECT_REACTION_EMOJI: Record<ConnectReaction, string> = {
  like: "👍",
  love: "❤️",
  celebrate: "🎉",
  laugh: "😂",
  wow: "😮",
};

export const CONNECT_REACTION_LABELS: Record<ConnectReaction, string> = {
  like: "Like",
  love: "Love",
  celebrate: "Celebrate",
  laugh: "Haha",
  wow: "Wow",
};

export const CONNECT_GROUP_ICONS = [
  "megaphone",
  "messages-square",
  "utensils",
  "chef-hat",
  "martini",
  "users",
  "party-popper",
  "sparkles",
  "wine",
  "coffee",
  "shield",
  "wrench",
] as const;

export type ConnectGroupIcon = (typeof CONNECT_GROUP_ICONS)[number];

export type ConnectCelebrationKind = "birthday" | "anniversary" | "shoutout";

export type ConnectPerson = {
  userId: string;
  name: string;
  photoUrl: string | null;
  positionName: string | null;
  departmentName: string | null;
};

export type ConnectGroup = {
  id: string;
  venueId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  archivedAt: string | null;
  /** Everyone with Hub access at the venue joins at this role automatically. */
  autoMemberRole: ConnectAutoMemberRole | null;
  /** People in these HR departments join automatically at the given role. */
  departmentRules: ConnectDepartmentRule[];
  memberCount: number;
  /** Viewer's role in this group; null when they see it only as a settings admin. */
  myRole: ConnectGroupRole | null;
};

export type ConnectGroupMember = {
  userId: string;
  role: ConnectGroupRole;
  /** True when the person is in the group only through an automatic rule. */
  auto: boolean;
  /** Which rule added them: "Everyone" or a department name. */
  autoSource: string | null;
  person: ConnectPerson;
};

export type ConnectAttachment = {
  id: string;
  fileUrl: string;
  contentType: string;
  originalName: string;
  fileSize: number;
};

export type ConnectComment = {
  id: string;
  postId: string;
  parentId: string | null;
  author: ConnectPerson | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  likeCount: number;
  likedByMe: boolean;
};

export type ConnectPost = {
  id: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  author: ConnectPerson | null;
  body: string;
  kind: "post" | "celebration";
  celebration: {
    kind: ConnectCelebrationKind;
    staffName: string;
    staffPhotoUrl: string | null;
    years: number | null;
  } | null;
  pinnedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  attachments: ConnectAttachment[];
  reactionCounts: Partial<Record<ConnectReaction, number>>;
  reactionTotal: number;
  myReaction: ConnectReaction | null;
  comments: ConnectComment[];
  /** Viewer capabilities for this post. */
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  canComment: boolean;
  canModerateComments: boolean;
};

export type ConnectCelebrationItem = {
  staffId: string;
  staffName: string;
  photoUrl: string | null;
  positionName: string | null;
  kind: "birthday" | "anniversary";
  occurrenceDate: string;
  daysFromToday: number;
  years: number | null;
};

export function isConnectGroupRole(value: string): value is ConnectGroupRole {
  return (CONNECT_GROUP_ROLES as readonly string[]).includes(value);
}

export function isConnectReaction(value: string): value is ConnectReaction {
  return (CONNECT_REACTIONS as readonly string[]).includes(value);
}
