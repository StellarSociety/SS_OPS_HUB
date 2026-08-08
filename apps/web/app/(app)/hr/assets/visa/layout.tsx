import { VisaSubNav } from "@/components/hr/visa-sub-nav";

export default function VisaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <VisaSubNav />
      {children}
    </div>
  );
}
