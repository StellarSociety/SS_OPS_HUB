import { assertModuleAccessible } from "@/lib/app-module-states";

export default async function SentimentModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertModuleAccessible("sentiment");
  return <>{children}</>;
}
