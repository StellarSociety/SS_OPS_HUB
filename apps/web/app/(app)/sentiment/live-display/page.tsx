import { LiveDisplaySimulator } from "@/components/sentiment/live-display-simulator";
import { getLiveDisplayPage } from "@/lib/sentiment/live-display/page-context";
import { venueThemeStyle } from "@/lib/venue/theme";

export default async function LiveDisplaySimulatorPage() {
  const { venue, view, settings } = await getLiveDisplayPage();

  if (venue.is_global || !view || !settings) {
    return (
      <p className="text-sm text-black/55">
        Live Display is available on venue workspaces, not Global.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <LiveDisplaySimulator
        themeStyle={venueThemeStyle(venue)}
        view={view}
        code={settings.public_code}
      />
    </div>
  );
}
