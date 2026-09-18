import { HideNextDevOverlay } from "@/components/dev/hide-next-dev-overlay";

export default function PublicHiringApplyLayout({
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
