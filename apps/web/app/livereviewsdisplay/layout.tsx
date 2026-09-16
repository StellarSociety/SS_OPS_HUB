import { HideNextDevOverlay } from "@/components/dev/hide-next-dev-overlay";

export default function PublicLiveDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HideNextDevOverlay />
      {children}
    </>
  );
}
