import { requireAppAdmin } from "@/lib/access/permissions";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAppAdmin();
  return children;
}
