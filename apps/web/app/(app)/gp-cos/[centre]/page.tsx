import { redirect } from "next/navigation";

/** A cost centre opens on its Insights. */
export default async function CosCentrePage({
  params,
}: {
  params: Promise<{ centre: string }>;
}) {
  const { centre } = await params;
  redirect(`/gp-cos/${centre}/insights`);
}
