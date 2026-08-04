import { UniformSubNav } from "@/components/hr/uniform-sub-nav";

export default function UniformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <UniformSubNav />
      {children}
    </div>
  );
}
