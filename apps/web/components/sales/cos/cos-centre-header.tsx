import { ModulePageTitle } from "@/components/layout/module-page-title";
import { CosCentreSubNav } from "@/components/sales/cos/cos-centre-sub-nav";
import {
  COS_CENTRE_SECTIONS,
  type CosCentreSection,
} from "@/lib/sales/cos-centre-sections";
import { COST_CENTRE_LABELS, type CostCentre } from "@/lib/sales/cos-types";

/** Shared title + section tabs for every cost-centre page (Food, Beverage…). */
export function CosCentreHeader({
  centre,
  section,
  subtitle,
}: {
  centre: CostCentre;
  section: CosCentreSection;
  subtitle: React.ReactNode;
}) {
  const sectionLabel =
    COS_CENTRE_SECTIONS.find((s) => s.key === section)?.label ?? "";
  return (
    <>
      <div>
        <ModulePageTitle>
          {COST_CENTRE_LABELS[centre]} — {sectionLabel}
        </ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{subtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>
      <CosCentreSubNav centre={centre} />
    </>
  );
}
