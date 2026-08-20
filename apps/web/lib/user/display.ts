import { isAppAdmin, type UserPermission } from "@/lib/role-permissions";

export function getUserRoleLabel(permissions: UserPermission[]): string {
  if (isAppAdmin(permissions)) return "Administrator";

  const hasEdit = permissions.some(
    (p) => p.access_level === "edit" || p.access_level === "admin",
  );
  if (hasEdit) return "Editor";

  return "User";
}

export function getUserInitials(
  fullName: string | null | undefined,
  email: string,
): string {
  const source = fullName?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
  }

  return source.charAt(0).toUpperCase();
}

/** First + last name only (drops middle names). */
export function firstLastName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim() ?? "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return trimmed;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
