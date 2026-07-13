import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function SalesForecastSettingsRedirectPage() {
  redirect(await scopedPath("/sales/forecast"));
}
