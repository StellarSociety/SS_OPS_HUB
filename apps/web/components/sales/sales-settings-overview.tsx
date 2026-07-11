import Link from "next/link";
import {
  ChevronRight,
  Database,
  Percent,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";

type SettingsOverviewItem = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

type SettingsOverviewSection = {
  title: string;
  items: SettingsOverviewItem[];
};

const sections: SettingsOverviewSection[] = [
  {
    title: "Configuration",
    items: [
      {
        href: "/sales/settings/tax",
        title: "Sales tax",
        description: "Municipality fees, VAT, service charge, and total tax rate.",
        icon: Percent,
      },
      {
        href: "/sales/settings/waiters",
        title: "Waiters",
        description: "Waiter names, positions, and active status for sales entry.",
        icon: Users,
      },
      {
        href: "/sales/settings/tenders",
        title: "Tenders",
        description: "Payment tender types on the waiter sales entry form.",
        icon: Wallet,
      },
      {
        href: "/sales/settings/groups-charge",
        title: "Groups charge",
        description: "Groups added service charge percentage on waiter sales.",
        icon: UserCog,
      },
    ],
  },
  {
    title: "Data",
    items: [
      {
        href: "/sales/settings/data-management",
        title: "Data management",
        description: "Excel templates and bulk import for daily sales, waiter sales, and discounts.",
        icon: Database,
      },
    ],
  },
];

function SettingsOverviewRow({ item }: { item: SettingsOverviewItem }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--venue-primary)]/5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--venue-primary)]/10 text-[#3D421F] transition-colors group-hover:bg-[var(--venue-primary)]/15">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[#3D421F]">{item.title}</p>
        <p className="mt-0.5 text-sm text-black/55">{item.description}</p>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-black/30 transition-colors group-hover:text-[#3D421F]"
        aria-hidden
      />
    </Link>
  );
}

export function SalesSettingsOverview() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        Configure sales tax, waiter setup, and imports for this venue.
      </p>

      <Card className="overflow-hidden p-0">
        {sections.map((section, sectionIndex) => (
          <div key={section.title}>
            {sectionIndex > 0 ? (
              <div className="border-t border-black/5" aria-hidden />
            ) : null}
            <div className="border-b border-black/5 bg-black/[0.02] px-5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
                {section.title}
              </p>
            </div>
            <div className="divide-y divide-black/5">
              {section.items.map((item) => (
                <SettingsOverviewRow key={item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
