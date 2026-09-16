import { LiveDisplayScreen } from "@/components/sentiment/live-display-screen";
import { loadLiveDisplayView } from "@/lib/sentiment/live-display/load";
import { getLiveDisplaySettingsByCode } from "@/lib/sentiment/live-display/store";
import { createServiceClient } from "@/lib/supabase/service";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { Venue } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params;
  const service = createServiceClient();
  const settings = await getLiveDisplaySettingsByCode(service, code).catch(
    () => null,
  );
  if (!settings || !settings.enabled) {
    return { title: "Live display" };
  }
  const { data: venue } = await service
    .from("venues")
    .select("name")
    .eq("id", settings.venue_id)
    .maybeSingle();
  return {
    title: `${venue?.name ?? "Venue"} live display`,
    appleWebApp: {
      capable: true,
      title: venue?.name ?? "Live display",
    },
  };
}

export default async function PublicLiveDisplayPage({ params }: PageProps) {
  const { code } = await params;
  const service = createServiceClient();
  const settings = await getLiveDisplaySettingsByCode(service, code);

  if (!settings || !settings.enabled) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-[#3D421F]">
            Display unavailable
          </h1>
          <p className="mt-2 text-sm text-black/60">
            This live display is off or the link is no longer valid.
          </p>
        </div>
      </main>
    );
  }

  const { data: venue } = await service
    .from("venues")
    .select("*")
    .eq("id", settings.venue_id)
    .maybeSingle();
  const venueRow = (venue ?? null) as Venue | null;
  if (!venueRow) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-[#3D421F]">
            Display unavailable
          </h1>
        </div>
      </main>
    );
  }

  const view = await loadLiveDisplayView(service, venueRow);

  return (
    <main
      className="h-dvh overflow-hidden"
      style={venueThemeStyle(venueRow)}
    >
      <LiveDisplayScreen view={view} />
    </main>
  );
}
