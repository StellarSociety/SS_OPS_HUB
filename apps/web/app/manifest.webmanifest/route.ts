import { NextResponse } from "next/server";
import { fetchGroupBrandingState } from "@/lib/group/branding";
import { buildPwaWebManifest } from "@/lib/pwa/web-manifest";

export async function GET() {
  const { appName } = await fetchGroupBrandingState();
  return NextResponse.json(buildPwaWebManifest("mobile", appName), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
