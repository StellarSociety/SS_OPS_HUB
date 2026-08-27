import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function GuestsIntelModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("guests_intel");
  return <>{children}</>;
}
