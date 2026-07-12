import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function HrModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("hr");
  return <>{children}</>;
}
