import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function GpCosModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("gp_cos");
  return <>{children}</>;
}
