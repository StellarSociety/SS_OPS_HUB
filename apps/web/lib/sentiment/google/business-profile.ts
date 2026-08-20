import "server-only";

import type { GoogleBusinessLocation } from "../types";

type AccountJson = {
  name?: string;
  accountName?: string;
  type?: string;
};

type LocationJson = {
  name?: string;
  title?: string;
  metadata?: {
    placeId?: string;
    mapsUri?: string;
  };
};

const STAR_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function idFromName(name: string | undefined, prefix: string): string | null {
  if (!name) return null;
  const parts = name.split("/");
  const idx = parts.indexOf(prefix);
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]!;
  return parts.at(-1) ?? null;
}

export async function listGoogleAccounts(
  accessToken: string,
): Promise<{ accountId: string; accountName: string }[]> {
  const response = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = (await response.json()) as {
    accounts?: AccountJson[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      json.error?.message ||
        "Could not list Google Business Profile accounts. Enable the Account Management API and request Business Profile API access.",
    );
  }
  return (json.accounts ?? [])
    .map((account) => ({
      accountId: idFromName(account.name, "accounts") ?? "",
      accountName: account.accountName || account.name || "Google account",
    }))
    .filter((account) => account.accountId);
}

export async function listGoogleLocations(
  accessToken: string,
  accountId: string,
  accountName: string,
): Promise<GoogleBusinessLocation[]> {
  const url = new URL(
    `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`,
  );
  url.searchParams.set("readMask", "name,title,metadata");
  url.searchParams.set("pageSize", "100");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json()) as {
    locations?: LocationJson[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      json.error?.message ||
        "Could not list Google Business locations. Enable the Business Information API.",
    );
  }

  return (json.locations ?? [])
    .map((location) => ({
      accountId,
      accountName,
      locationId: idFromName(location.name, "locations") ?? "",
      title: location.title || "Untitled location",
      placeId: location.metadata?.placeId ?? null,
      mapsUri: location.metadata?.mapsUri ?? null,
    }))
    .filter((location) => location.locationId);
}

export async function listAllGoogleLocations(
  accessToken: string,
): Promise<GoogleBusinessLocation[]> {
  const accounts = await listGoogleAccounts(accessToken);
  const nested = await Promise.all(
    accounts.map((account) =>
      listGoogleLocations(accessToken, account.accountId, account.accountName),
    ),
  );
  return nested.flat();
}

export type GoogleBusinessReview = {
  externalId: string;
  authorName: string | null;
  authorPhotoUrl: string | null;
  authorProfileUrl: string | null;
  rating: number | null;
  comment: string | null;
  reviewedAt: string | null;
  language: string | null;
  replyText: string | null;
  replyAt: string | null;
  reviewUrl: string | null;
  photoUrls: string[];
  raw: Record<string, unknown>;
};

export async function listGoogleBusinessReviews(
  accessToken: string,
  accountId: string,
  locationId: string,
): Promise<{
  reviews: GoogleBusinessReview[];
  averageRating: number | null;
  totalReviewCount: number | null;
}> {
  const reviews: GoogleBusinessReview[] = [];
  let pageToken: string | undefined;
  let averageRating: number | null = null;
  let totalReviewCount: number | null = null;

  do {
    const url = new URL(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`,
    );
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await response.json()) as {
      reviews?: Array<{
        reviewId?: string;
        name?: string;
        reviewer?: { displayName?: string; profilePhotoUrl?: string };
        starRating?: string;
        comment?: string;
        createTime?: string;
        updateTime?: string;
        reviewReply?: { comment?: string; updateTime?: string };
        reviewReplyUrl?: string;
      }>;
      averageRating?: number;
      totalReviewCount?: number;
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        json.error?.message || "Could not list Google Business Profile reviews.",
      );
    }

    averageRating = json.averageRating ?? averageRating;
    totalReviewCount = json.totalReviewCount ?? totalReviewCount;
    for (const review of json.reviews ?? []) {
      const externalId =
        review.reviewId || idFromName(review.name, "reviews") || review.name;
      if (!externalId) continue;
      reviews.push({
        externalId,
        authorName: review.reviewer?.displayName ?? null,
        authorPhotoUrl: review.reviewer?.profilePhotoUrl ?? null,
        authorProfileUrl: null,
        rating: STAR_MAP[review.starRating ?? ""] ?? null,
        comment: review.comment ?? null,
        reviewedAt: review.createTime ?? review.updateTime ?? null,
        language: null,
        replyText: review.reviewReply?.comment ?? null,
        replyAt: review.reviewReply?.updateTime ?? null,
        reviewUrl: review.reviewReplyUrl ?? null,
        photoUrls: [],
        raw: review as Record<string, unknown>,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return { reviews, averageRating, totalReviewCount };
}

export async function updateGoogleReviewReply(
  accessToken: string,
  accountId: string,
  locationId: string,
  reviewId: string,
  comment: string,
): Promise<void> {
  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews/${encodeURIComponent(reviewId)}/reply`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment }),
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      json.error?.message || "Could not post this reply to Google.",
    );
  }
}

export async function deleteGoogleReviewReply(
  accessToken: string,
  accountId: string,
  locationId: string,
  reviewId: string,
): Promise<void> {
  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews/${encodeURIComponent(reviewId)}/reply`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (response.ok || response.status === 404) return;
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  throw new Error(
    json.error?.message || "Could not remove this reply on Google.",
  );
}
