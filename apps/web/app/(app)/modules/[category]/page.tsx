import { notFound } from "next/navigation";
import { ModuleGrid } from "@/components/modules/module-grid";
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
      <div className="space-y-3">
        <h1 className="font-serif text-3xl text-[#3D421F]">{meta.pageTitle}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-black/60">
          {meta.description}
        </p>
      </div>

      <ModuleGrid modules={modules} />

      <div className="min-h-48" aria-hidden />
    </div>
  );
}
