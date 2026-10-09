import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

/** Group feeds now open inside the Connecteam messenger. */
export default async function ConnectGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { groupId } = await params;
  const query = new URLSearchParams(
    Object.entries(await searchParams).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  redirect(await scopedPath(`/connect/chats/feed/${groupId}${query ? `?${query}` : ""}`));
}
