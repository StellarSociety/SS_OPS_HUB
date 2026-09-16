import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobilePayslipsRedirectPage({ params }: PageProps) {
  const { venueSlug } = await params;
  redirect(`/m/${venueSlug}/docs`);
}
