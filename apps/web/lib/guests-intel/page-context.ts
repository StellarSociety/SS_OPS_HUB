import { redirect } from "next/navigation";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { createServiceClient } from "@/lib/supabase/service";
import {
  canEditCollect,
  canEditRedeem,
  canEditRewards,
} from "./permissions";
import {
  countDashboard,
  ensureVenueDefaults,
  listGuests,
  listRewards,
} from "./store";
import { generateQrSvg } from "./qr";
import { guestFormPath } from "./types";

export async function getGuestsIntelPageContext() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  const service = createServiceClient();
  const settings = venue.is_global
    ? null
    : await ensureVenueDefaults(service, venue.id, venue.name, venue.slug).catch(
        () => null,
      );

  return {
    supabase,
    service,
    venue,
    permissions: permissions ?? [],
    user,
    settings,
  };
}

export async function getGuestsIntelDashboardPage() {
  const ctx = await getGuestsIntelPageContext();
  const stats = ctx.venue.is_global
    ? { guestsTotal: 0, guestsThisMonth: 0, issuedOpen: 0, redeemed: 0 }
    : await countDashboard(ctx.supabase, ctx.venue.id).catch(() => ({
        guestsTotal: 0,
        guestsThisMonth: 0,
        issuedOpen: 0,
        redeemed: 0,
      }));

  return { ...ctx, stats };
}

export async function getGuestsIntelCollectPage(origin: string) {
  const ctx = await getGuestsIntelPageContext();
  const rewards = ctx.venue.is_global
    ? []
    : await listRewards(ctx.supabase, ctx.venue.id, { activeOnly: true }).catch(
        () => [],
      );
  const formUrl =
    ctx.settings && origin
      ? `${origin}${guestFormPath(ctx.settings.public_token)}`
      : "";
  const formQrSvg = formUrl ? await generateQrSvg(formUrl) : "";

  return {
    ...ctx,
    rewards,
    formUrl,
    formQrSvg,
    canEdit: canEditCollect(ctx.permissions, ctx.venue.id),
  };
}

export async function getGuestsIntelGuestsPage() {
  const ctx = await getGuestsIntelPageContext();
  const guests = ctx.venue.is_global
    ? []
    : await listGuests(ctx.supabase, ctx.venue.id).catch(() => []);
  return { ...ctx, guests };
}

export async function getGuestsIntelRewardsPage() {
  const ctx = await getGuestsIntelPageContext();
  const rewards = ctx.venue.is_global
    ? []
    : await listRewards(ctx.supabase, ctx.venue.id, {
        includeArchived: true,
      }).catch(() => []);
  return {
    ...ctx,
    rewards,
    canEdit: canEditRewards(ctx.permissions, ctx.venue.id),
  };
}

export async function getGuestsIntelRedeemPage() {
  const ctx = await getGuestsIntelPageContext();
  return {
    ...ctx,
    canEdit: canEditRedeem(ctx.permissions, ctx.venue.id),
  };
}
