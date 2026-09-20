"use client";

import { usePathname } from "next/navigation";
import { HubTermsAcceptanceDialog } from "@/components/hub-terms/hub-terms-acceptance-dialog";
import type { HubTermsClient } from "@/lib/hub-terms";
import type { Venue } from "@/lib/types/database";

export function HubTermsGate({
  accepted,
  venue,
  client,
}: {
  accepted: boolean;
  venue: Venue;
  client: HubTermsClient;
}) {
  const pathname = usePathname();
  if (accepted) return null;
  if (pathname.includes("/hub-terms") && !pathname.includes("/acknowledgements/")) {
    return null;
  }
  if (client === "mobile" && pathname.includes("/terms")) return null;
  return <HubTermsAcceptanceDialog venue={venue} client={client} />;
}
