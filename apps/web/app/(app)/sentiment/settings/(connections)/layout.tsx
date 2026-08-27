import { ConnectionsSubNav } from "@/components/sentiment/connections-sub-nav";

export default function SentimentConnectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <ConnectionsSubNav />
      {children}
    </div>
  );
}
