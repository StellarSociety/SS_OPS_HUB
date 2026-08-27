import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function SentimentConnectionsIndexPage() {
  redirect(await scopedPath("/sentiment/settings/apify"));
}
