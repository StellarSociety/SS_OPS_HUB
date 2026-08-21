import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function MobileModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("mobile_app");
  return <>{children}</>;
}
