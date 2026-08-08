import { InsuranceSubNav } from "@/components/hr/insurance-sub-nav";

export default function InsuranceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <InsuranceSubNav />
      {children}
    </div>
  );
}
