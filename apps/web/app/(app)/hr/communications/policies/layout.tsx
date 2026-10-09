import { PoliciesSection } from "@/components/hr/policies-sub-nav";

export default function HrPoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PoliciesSection>{children}</PoliciesSection>;
}
