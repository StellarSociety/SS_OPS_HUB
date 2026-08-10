import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function AccountingModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("accounting");
  return <>{children}</>;
}
