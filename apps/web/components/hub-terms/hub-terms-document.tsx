import type { MobileTermsDocument } from "@/lib/mobile/terms-content";
import { cn } from "@/lib/utils";

export function HubTermsDocument({
  terms,
  className,
  titleClassName,
}: {
  terms: MobileTermsDocument;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <h1
        id="hub-terms-title"
        className={cn(
          "text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]",
          titleClassName,
        )}
      >
        {terms.title}
      </h1>
      <p className="mt-1 text-center text-xs text-black/50 dark:text-white/50">
        Effective {terms.effectiveDate}
      </p>
      <p className="mt-0.5 text-center text-xs text-black/40 dark:text-white/40">
        {terms.productName}
      </p>
      <hr className="mt-3 border-black/10 dark:border-white/12" />

      <p className="mt-4 text-justify text-sm leading-relaxed text-black/70 dark:text-white/70">
        {terms.intro}
      </p>

      <div className="mt-5 space-y-5">
        {terms.sections.map((section) => (
          <section key={section.id}>
            <h2 className="font-serif text-base font-bold text-[#3D421F] dark:text-[CanvasText]">
              {section.heading}
            </h2>
            <div className="mt-1.5 space-y-2">
              {section.paragraphs.map((paragraph, index) => (
                <p
                  key={`${section.id}-${index}`}
                  className="text-justify text-sm leading-relaxed text-black/65 dark:text-white/65"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
