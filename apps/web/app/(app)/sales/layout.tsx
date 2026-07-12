import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function SalesModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("sales");
  return <>{children}</>;
}
