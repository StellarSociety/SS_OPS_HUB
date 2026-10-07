import { CosSectionPlaceholderPage } from "@/components/sales/cos/cos-section-placeholder";

export default function Page({
  params,
}: {
  params: Promise<{ centre: string }>;
}) {
  return <CosSectionPlaceholderPage params={params} section="insights" />;
}
