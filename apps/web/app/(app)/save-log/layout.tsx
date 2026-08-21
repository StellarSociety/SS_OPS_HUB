import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function SaveLogModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("save_log");
  return <>{children}</>;
}
