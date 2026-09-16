import { permanentRedirect } from "next/navigation";
import { liveDisplayPath } from "@/lib/sentiment/live-display/types";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function LegacyLiveDisplayRedirect({ params }: PageProps) {
  const { code } = await params;
  permanentRedirect(liveDisplayPath(code));
}
