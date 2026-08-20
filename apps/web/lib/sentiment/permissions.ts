import {
  hasFeatureAccess,
  hasPermission,
  isAppAdmin,
  type AccessLevel,
  type UserPermission,
} from "@/lib/role-permissions";
import { SENTIMENT_FEATURES, SENTIMENT_MODULE_KEY } from "./types";

function matchesVenueScope(
  permissionVenueId: string | null,
  venueId: string,
): boolean {
  return permissionVenueId === null || permissionVenueId === venueId;
}

function hasSentimentFeatureAccess(
  permissions: UserPermission[],
  featureKey: string,
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === SENTIMENT_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasFeatureAccess([p], SENTIMENT_MODULE_KEY, featureKey),
  );
}

function hasSentimentPermission(
  permissions: UserPermission[],
  featureKey: string,
  minLevel: AccessLevel,
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === SENTIMENT_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasPermission([p], SENTIMENT_MODULE_KEY, featureKey, minLevel),
  );
}

export function canAccessOverview(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSentimentFeatureAccess(
    permissions,
    SENTIMENT_FEATURES.overview,
    venueId,
  );
}

export function canAccessReviews(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSentimentFeatureAccess(
    permissions,
    SENTIMENT_FEATURES.reviews,
    venueId,
  );
}

export function canEditReviews(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSentimentPermission(
    permissions,
    SENTIMENT_FEATURES.reviews,
    "edit",
    venueId,
  );
}

export function canAccessActions(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSentimentFeatureAccess(
    permissions,
    SENTIMENT_FEATURES.actions,
    venueId,
  );
}

export function canEditActions(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSentimentPermission(
    permissions,
    SENTIMENT_FEATURES.actions,
    "edit",
    venueId,
  );
}

export function canAccessSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSentimentFeatureAccess(
    permissions,
    SENTIMENT_FEATURES.settings,
    venueId,
  );
}

export function canAdminSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasSentimentPermission(
    permissions,
    SENTIMENT_FEATURES.settings,
    "admin",
    venueId,
  );
}

export function firstAccessibleSentimentPath(
  permissions: UserPermission[],
  venueId: string,
): string | null {
  if (canAccessOverview(permissions, venueId)) return "/sentiment";
  if (canAccessReviews(permissions, venueId)) return "/sentiment/reviews";
  if (canAccessActions(permissions, venueId)) return "/sentiment/actions";
  if (canAccessSettings(permissions, venueId)) return "/sentiment/settings";
  return null;
}
