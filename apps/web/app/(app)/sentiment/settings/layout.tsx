import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { SentimentSettingsSubNav } from "@/components/sentiment/sentiment-settings-sub-nav";
import { canAccessSettings } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";

export default async function SentimentSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSentimentPageContext();

  if (!canAccessSettings(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Sentiment Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Channels and reply templates for {venue.name}.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <SentimentSettingsSubNav />
      {children}
    </div>
  );
}
