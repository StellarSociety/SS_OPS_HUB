import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { assertModuleAccessible } from "@/lib/app-module-states";
import { getConnectPageContext } from "@/lib/connect/page-context";

export default async function ConnectModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("team_connect");
  const { venue, canAccess } = await getConnectPageContext();

  if (!canAccess) return <AccessDeniedBounce />;

  if (venue.is_global) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-black/5 bg-white p-8 text-center text-sm text-black/60 shadow-sm">
        Connecteam is venue-based. Open it from a venue to see its groups and feed.
      </div>
    );
  }

  return <>{children}</>;
}
