/** Who may upload a custom profile photo (vs. HR staff photo only). */
export function canManageProfileAvatar(user: {
  is_external?: boolean | null;
  email: string;
  staff?: { emp_no?: string | null } | null;
}): boolean {
  if (user.is_external) return true;
  if (user.staff?.emp_no === "GRP0001") return true;
  return user.email.trim().toLowerCase() === "admin@orillarestaurant.com";
}
