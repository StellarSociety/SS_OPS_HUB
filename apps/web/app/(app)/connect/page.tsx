import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

/** Connecteam opens on the Chats page (the feed lives inside it). */
export default async function ConnectFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  // Feed links (e.g. ?celebrate=…) still land on the feed; everything else opens Chats.
  const target = query ? `/connect/chats/feed?${query}` : "/connect/chats";
  redirect(await scopedPath(target));
}
