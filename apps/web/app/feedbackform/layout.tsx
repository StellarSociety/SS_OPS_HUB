import { HideNextDevOverlay } from "@/components/dev/hide-next-dev-overlay";

export default function PublicFeedbackFormLayout({
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
