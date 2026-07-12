import { HrLookupsSubNav } from "@/components/hr/hr-lookups-sub-nav";

export default function HrLookupsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <HrLookupsSubNav />
      {children}
    </div>
  );
}
