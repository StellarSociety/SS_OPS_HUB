import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function DirectoryModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("directory");
  return <>{children}</>;
}
