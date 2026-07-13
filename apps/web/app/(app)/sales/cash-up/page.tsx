import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function SalesCashUpRedirectPage() {
  redirect(await scopedPath("/sales/daily-snap"));
}
