import { createServiceClient } from "@/lib/supabase/service";

/** Built-in Stellar Society Group wordmark used on sign-in until a custom file is uploaded. */
export const DEFAULT_GROUP_LOGO_URL = "/brand/stellar-society-group-logo.webp";

export const GROUP_LOGO_STORAGE_PATHS = [
  "group/logo.webp",
  "group/logo.png",
  "group/logo.jpg",
  "group/logo.jpeg",
  "group/logo.svg",
] as const;

export type GroupLogoState = {
  /** URL to render (uploaded override or built-in default). */
  logoUrl: string;
  /** Stored override URL, or null when using the built-in default. */
  storedUrl: string | null;
};

export function resolveGroupLogoUrl(storedUrl: string | null | undefined): string {
  const trimmed = storedUrl?.trim();
  return trimmed || DEFAULT_GROUP_LOGO_URL;
}

export async function fetchGroupLogoState(): Promise<GroupLogoState> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("group_branding")
      .select("logo_url")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[group_branding] fetch failed:", error.message);
      return { logoUrl: DEFAULT_GROUP_LOGO_URL, storedUrl: null };
    }

    const storedUrl =
      typeof data?.logo_url === "string" && data.logo_url.trim()
        ? data.logo_url
        : null;

    return { logoUrl: resolveGroupLogoUrl(storedUrl), storedUrl };
  } catch (error) {
    console.error("[group_branding] fetch failed:", error);
    return { logoUrl: DEFAULT_GROUP_LOGO_URL, storedUrl: null };
  }
}
