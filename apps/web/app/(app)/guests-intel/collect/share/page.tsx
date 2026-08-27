import { headers } from "next/headers";
import { CollectSharePanel } from "@/components/guests-intel/collect-share-panel";
import { canAccessCollect } from "@/lib/guests-intel/permissions";
import { getGuestsIntelCollectPage } from "@/lib/guests-intel/page-context";

async function requestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  if (!host) return "";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export default async function GuestsIntelCollectSharePage() {
  const origin = await requestOrigin();
  const { venue, permissions, formUrl, formQrSvg, settings } =
    await getGuestsIntelCollectPage(origin);

  if (!canAccessCollect(permissions, venue.id)) {
    return null;
  }

  return (
    <CollectSharePanel
      formUrl={formUrl}
      formQrSvg={formQrSvg}
      publicFormEnabled={settings?.public_form_enabled ?? false}
    />
  );
}
