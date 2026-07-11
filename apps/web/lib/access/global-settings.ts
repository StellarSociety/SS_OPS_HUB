import { redirect } from "next/navigation";
import { requireAppAdmin } from "@/lib/access/permissions";

/** App admins managing cross-venue / Global configuration. */
export async function requireGlobalSettingsAccess() {
  return requireAppAdmin();
}

export function operationalVenues<T extends { is_global: boolean }>(venues: T[]): T[] {
  return venues.filter((venue) => !venue.is_global);
}
