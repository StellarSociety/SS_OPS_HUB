import { LiveDisplaySharePanel } from "@/components/sentiment/live-display-share-panel";
import { getLiveDisplayPage } from "@/lib/sentiment/live-display/page-context";

export default async function LiveDisplaySharePage() {
  const { venue, settings, displayUrl, displayQrSvg, canEdit } =
    await getLiveDisplayPage();

  if (venue.is_global || !settings) {
    return (
      <p className="text-sm text-black/55">
        Live Display is available on venue workspaces, not Global.
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <LiveDisplaySharePanel
        settings={settings}
        displayUrl={displayUrl}
        displayQrSvg={displayQrSvg}
        canEdit={canEdit}
      />
    </div>
  );
}
