/** Resolve the best avatar URL for shell UI (header, profile hero, users list). */
export function resolveAvatarUrl(params: {
  profileAvatarUrl?: string | null;
  /** Cropped staff profile photo (staff-photos) when the user is linked to staff. */
  staffPhotoUrl?: string | null;
  userMetadata?: Record<string, unknown> | undefined;
  /**
   * When true (typical for venue staff whose hub photo is HR-managed), the
   * staff photo wins over a custom profile avatar.
   */
  preferStaffPhoto?: boolean;
}): string | null {
  const fromProfile =
    typeof params.profileAvatarUrl === "string" && params.profileAvatarUrl.trim()
      ? params.profileAvatarUrl.trim()
      : null;

  const fromStaff =
    typeof params.staffPhotoUrl === "string" && params.staffPhotoUrl.trim()
      ? params.staffPhotoUrl.trim()
      : null;

  if (params.preferStaffPhoto && fromStaff) return fromStaff;
  if (fromProfile) return fromProfile;
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
