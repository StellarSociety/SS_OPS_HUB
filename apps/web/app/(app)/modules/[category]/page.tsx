import { notFound } from "next/navigation";
import { AppsHubStage } from "@/components/modules/apps-hub-stage";
import { loadModulesHubContext } from "@/lib/modules-hub-data";
import {
  getModuleCategoryMeta,
  isModuleCategoryKey,
} from "@/lib/modules-registry";

type CategoryPageProps = {
  params: Promise<{ category: string }>;
};

export default async function ModuleCategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  if (!isModuleCategoryKey(category)) {
    notFound();
  }

  const meta = getModuleCategoryMeta(category);
  const { getCategoryModules } = await loadModulesHubContext();
  const modules = getCategoryModules(category);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40">
          Apps Hub
        </p>
        <h1 className="font-serif text-3xl tracking-tight text-[#3D421F] md:text-4xl">
          {meta.pageTitle}
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-black/55">
          {meta.description}
        </p>
      </header>

      <AppsHubStage
        sections={[{ category: { key: category, label: meta.pageTitle }, modules }]}
      />
    </div>
  );
}
