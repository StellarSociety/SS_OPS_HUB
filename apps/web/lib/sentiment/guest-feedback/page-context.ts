import { headers } from "next/headers";
import { generateQrSvg } from "@/lib/guests-intel/qr";
import { createServiceClient } from "@/lib/supabase/service";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { canEditGuestFeedback } from "@/lib/sentiment/permissions";
import { guestFeedbackPath, livePromotions } from "./types";
import { resolveVenueAddress } from "./venue-address";
import { loadGuestFeedbackOutboundLinks } from "./outbound-links";
import {
  ensureGuestFeedbackDefaults,
  listPromotions,
  listQuestions,
} from "./store";

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  if (!host) return "";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function getGuestFeedbackPage() {
  const ctx = await getSentimentPageContext();
  if (ctx.venue.is_global) {
    return {
      ...ctx,
      settings: null,
      questions: [],
      promotions: [],
      livePromos: [],
      formUrl: "",
      formQrSvg: "",
      venueAddress: null as string | null,
      socials: [],
      canEdit: false,
    };
  }

  const service = createServiceClient();
  const settings = await ensureGuestFeedbackDefaults(service, ctx.venue.id);
  const [questions, promotions, venueAddress, socials] = await Promise.all([
    listQuestions(service, ctx.venue.id),
    listPromotions(service, ctx.venue.id),
    resolveVenueAddress(service, ctx.venue),
    loadGuestFeedbackOutboundLinks(service, ctx.venue),
  ]);

  const origin = await requestOrigin();
  const formUrl = origin
    ? `${origin}${guestFeedbackPath(settings.public_code)}`
    : guestFeedbackPath(settings.public_code);
  const formQrSvg = formUrl ? await generateQrSvg(formUrl) : "";

  return {
    ...ctx,
    settings,
    questions,
    promotions,
    livePromos: livePromotions(promotions),
    formUrl,
    formQrSvg,
    venueAddress,
    socials,
    canEdit: canEditGuestFeedback(ctx.permissions, ctx.venue.id),
  };
}
