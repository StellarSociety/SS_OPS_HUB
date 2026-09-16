import { generateQrSvg } from "@/lib/guests-intel/qr";
import { joinAppUrl, publicAppUrl } from "@/lib/public-app-url";
import { createServiceClient } from "@/lib/supabase/service";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { canEditLiveDisplay } from "@/lib/sentiment/permissions";
import { liveDisplayPath, type LiveDisplayView } from "./types";
import { loadLiveDisplayView } from "./load";
import { ensureLiveDisplayDefaults } from "./store";

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
  const displayUrl = joinAppUrl(
    liveDisplayPath(settings.public_code),
    publicAppUrl(),
  );
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
