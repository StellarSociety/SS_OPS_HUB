import { redirect } from "next/navigation";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { scopedHrefForVenue } from "@/lib/venue/scope-routing";

export default async function WaitersDailyTotalRedirectPage() {
  const { venue } = await getSalesPageContext();
  redirect(
    scopedHrefForVenue(venue, "/sales/daily-vs-waiters/figures-verification"),
  );
}
