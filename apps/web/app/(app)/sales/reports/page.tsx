import {
  Banknote,
  HandCoins,
  Tag,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { GratuityReportHubItem } from "@/components/sales/gratuity-report-hub-item";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { canAccessWaiterDaily } from "@/lib/sales/permissions";
import {
  listVenueWaiterGratuityRows,
  type VenueWaiterGratuityRow,
} from "@/lib/sales/waiter-sales-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";

type ReportLink = {
  id: string;
  href: string;
  title: string;
  description: string;
};

type ReportCategory = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  reports: ReportLink[];
};

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: "revenue",
    title: "Revenue",
    description: "Sales, tender mix, and period revenue summaries.",
    icon: Banknote,
    reports: [],
  },
  {
    id: "gratuity",
    title: "Gratuity",
    description: "Tips and gratuity breakdowns by cash and credit card.",
    icon: HandCoins,
    reports: [
      {
        id: "monthly-by-day",
        href: "/sales/reports/gratuity/monthly-by-day",
        title: "Monthly gratuity by day",
        description:
          "Cash and credit card gratuity totals for every day of the month.",
      },
    ],
  },
  {
    id: "discounts",
    title: "Discounts",
    description: "Discount totals, reasons, and period comparisons.",
    icon: Tag,
    reports: [],
  },
  {
    id: "vouchers",
    title: "Vouchers",
    description: "Issued, redeemed, and outstanding voucher activity.",
    icon: Ticket,
    reports: [],
  },
];

export default async function SalesReportsPage() {
  const { venue, permissions, supabase, user } = await getSalesPageContext();
  const canExportGratuity = canAccessWaiterDaily(permissions, venue.id);

  let gratuityRecords: VenueWaiterGratuityRow[] = [];
  let userDisplayName = buildExportUserLabel(null, user.email);

  if (canExportGratuity) {
    const [rows, profileResult] = await Promise.all([
      listVenueWaiterGratuityRows(supabase, venue.id).catch((error) => {
        console.error("[sales/reports] gratuity rows:", error);
        return [] as VenueWaiterGratuityRow[];
      }),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
    ]);
    gratuityRecords = rows;
    userDisplayName = buildExportUserLabel(
      profileResult.data?.full_name,
      profileResult.data?.email ?? user.email,
    );
  }

  const venueLogoUrl = getVenueLogoUrl(venue);

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Reports</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Exportable sales reports for {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORT_CATEGORIES.map(
          ({ id, title, description, icon: Icon, reports }) => (
            <section
              key={id}
              id={id}
              aria-labelledby={`reports-${id}-heading`}
              className="flex min-h-[11rem] flex-col rounded-xl border border-black/10 bg-white/50 p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--venue-secondary,#F0F3DD)]/80 text-[var(--venue-primary,#818a40)]">
                  <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2
                    id={`reports-${id}-heading`}
                    className="font-serif text-lg text-[#3D421F]"
                  >
                    {title}
                  </h2>
                  <p className="mt-0.5 text-sm text-black/55">{description}</p>
                </div>
              </div>

              {reports.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {reports.map((report) => (
                    <li key={report.id}>
                      {id === "gratuity" &&
                      report.id === "monthly-by-day" ? (
                        <GratuityReportHubItem
                          href={report.href}
                          title={report.title}
                          description={report.description}
                          venueName={venue.name}
                          venueLogoUrl={venueLogoUrl}
                          userDisplayName={userDisplayName}
                          waiterRecords={gratuityRecords}
                          canExport={canExportGratuity}
                        />
                      ) : (
                        <Link
                          href={report.href}
                          className="block rounded-lg border border-black/10 bg-white/70 px-3.5 py-3 transition-colors hover:border-[var(--venue-primary,#818a40)]/30 hover:bg-[var(--venue-primary,#818a40)]/[0.04]"
                        >
                          <span className="block text-sm font-semibold text-[#3D421F]">
                            {report.title}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-black/55">
                            {report.description}
                          </span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#d8d9c8] bg-white/40 px-4 py-8">
                  <p className="text-center text-sm text-black/45">
                    Reports for this category will appear here.
                  </p>
                </div>
              )}
            </section>
          ),
        )}
      </div>
    </div>
  );
}
