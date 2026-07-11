import { redirect } from "next/navigation";
import { listVenues } from "@/lib/access/store";
import { operationalVenues } from "@/lib/access/global-settings";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeVenueRows } from "@/lib/venue/normalize";

export default async function GlobalBrandingIndexPage() {
  const service = createServiceClient();
  const venues = operationalVenues(normalizeVenueRows(await listVenues(service)));
  const first = venues[0];

  if (!first) {
    redirect("/global/settings");
  }

  redirect(`/global/settings/branding/${first.slug}`);
}
