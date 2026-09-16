import { permanentRedirect } from "next/navigation";
import { guestFeedbackPath } from "@/lib/sentiment/guest-feedback/types";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function LegacyGuestFeedbackRedirect({ params }: PageProps) {
  const { code } = await params;
  permanentRedirect(guestFeedbackPath(code));
}
