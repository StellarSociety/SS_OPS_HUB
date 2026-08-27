import { headers } from "next/headers";
import { generateQrSvg } from "@/lib/guests-intel/qr";
import { createServiceClient } from "@/lib/supabase/service";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { canEditLiveDisplay } from "@/lib/sentiment/permissions";
import { liveDisplayPath, type LiveDisplayView } from "./types";
import { loadLiveDisplayView } from "./load";
import { ensureLiveDisplayDefaults } from "./store";

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  if (!host) return "";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function getLiveDisplayPage() {
  const ctx = await getSentimentPageContext();
  if (ctx.venue.is_global) {
    return {
      ...ctx,
      settings: null,
      displayUrl: "",
      displayQrSvg: "",
      view: null as LiveDisplayView | null,
      canEdit: false,
    };
  }

  const service = createServiceClient();
  const settings = await ensureLiveDisplayDefaults(service, ctx.venue.id);
  const origin = await requestOrigin();
  const displayUrl = origin
    ? `${origin}${liveDisplayPath(settings.public_code)}`
    : liveDisplayPath(settings.public_code);
  const [displayQrSvg, view] = await Promise.all([
    displayUrl ? generateQrSvg(displayUrl) : Promise.resolve(""),
    loadLiveDisplayView(service, ctx.venue),
  ]);

  return {
    ...ctx,
    settings,
    displayUrl,
    displayQrSvg,
    view,
    canEdit: canEditLiveDisplay(ctx.permissions, ctx.venue.id),
  };
}
