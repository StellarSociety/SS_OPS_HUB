import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { LiveDisplaySubNav } from "@/components/sentiment/live-display-sub-nav";
import { canAccessLiveDisplay } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";

export default async function LiveDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSentimentPageContext();

  if (!canAccessLiveDisplay(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full flex-col gap-6">
      <div className="shrink-0 space-y-6">
        <div>
          <ModulePageTitle>Live Display</ModulePageTitle>
          <p className="mt-1 text-sm text-black/60">
            Preview the restaurant iPad, then share a public link that runs
            without signing in — for {venue.name}.
          </p>
          <hr className="mt-4 border-black/10" />
        </div>
        <LiveDisplaySubNav />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
