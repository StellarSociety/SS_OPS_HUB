import { CertificationsSubNav } from "@/components/hr/certifications-sub-nav";

export default function CertificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <CertificationsSubNav />
      {children}
    </div>
  );
}
