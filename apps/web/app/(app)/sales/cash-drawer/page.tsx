import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";

export default async function SalesCashDrawerRedirectPage() {
  redirect(await scopedPath("/sales/discounts"));
}
