import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function GlobalSettingsPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href="/global/settings/branding">
        <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
          <h2 className="font-serif text-xl text-[#3D421F]">Branding</h2>
          <p className="mt-2 text-sm text-black/60">
            Logo, icon, favicon, display name, and brand colors for each venue.
          </p>
        </Card>
      </Link>
    </div>
  );
}
