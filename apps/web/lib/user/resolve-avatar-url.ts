/** Resolve the best avatar URL for shell UI (header, profile hero). */
export function resolveAvatarUrl(params: {
  profileAvatarUrl?: string | null;
  staffPhotoUrl?: string | null;
  userMetadata?: Record<string, unknown> | undefined;
}): string | null {
  const fromProfile =
    typeof params.profileAvatarUrl === "string" && params.profileAvatarUrl.trim()
      ? params.profileAvatarUrl.trim()
      : null;
  if (fromProfile) return fromProfile;

  const fromStaff =
    typeof params.staffPhotoUrl === "string" && params.staffPhotoUrl.trim()
      ? params.staffPhotoUrl.trim()
      : null;
  if (fromStaff) return fromStaff;

  const meta = params.userMetadata;
  const fromMetaAvatar =
    typeof meta?.avatar_url === "string" && meta.avatar_url.trim()
      ? meta.avatar_url.trim()
      : null;
  if (fromMetaAvatar) return fromMetaAvatar;

  const fromMetaPicture =
    typeof meta?.picture === "string" && meta.picture.trim()
      ? meta.picture.trim()
      : null;
  if (fromMetaPicture) return fromMetaPicture;

  return null;
}
