import { Globe } from "lucide-react";
import {
  ORILLA_CREAM,
  ORILLA_MARK_PATH,
  ORILLA_OLIVE,
  ORILLA_WORDMARK_PATH,
} from "@/lib/venue/orilla-brand";
import { cn } from "@/lib/utils";

export type VenueBrandVariant = "mark" | "badge" | "wordmark";

type VenueBrandIconProps = {
  slug: string;
  name: string;
  isGlobal?: boolean;
  primaryColor?: string;
  variant: VenueBrandVariant;
  className?: string;
  title?: string;
};

function OrillaMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <path fill={ORILLA_OLIVE} fillRule="evenodd" d={ORILLA_MARK_PATH} />
    </svg>
  );
}

function OrillaBadge({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <circle cx="200" cy="200" r="200" fill={ORILLA_OLIVE} />
      <path fill={ORILLA_CREAM} fillRule="evenodd" d={ORILLA_MARK_PATH} />
    </svg>
  );
}

function OrillaWordmark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="31 257 741 289"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <path fill={ORILLA_OLIVE} fillRule="evenodd" d={ORILLA_WORDMARK_PATH} />
    </svg>
  );
}

function VenueFallbackIcon({
  name,
  primaryColor,
  className,
}: {
  name: string;
  primaryColor: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-serif text-white",
        className,
      )}
      style={{ backgroundColor: primaryColor }}
      aria-hidden
    >
      {name.charAt(0)}
    </div>
  );
}

export function VenueBrandIcon({
  slug,
  name,
  isGlobal = false,
  primaryColor = ORILLA_OLIVE,
  variant,
  className,
  title,
}: VenueBrandIconProps) {
  if (isGlobal) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-[#3D421F]/10",
          className,
        )}
        aria-hidden={title ? undefined : true}
        title={title}
      >
        <Globe className="h-[55%] w-[55%] text-[#3D421F]/70" strokeWidth={1.5} />
      </div>
    );
  }

  if (slug === "orilla") {
    switch (variant) {
      case "badge":
        return <OrillaBadge className={className} title={title ?? name} />;
      case "mark":
        return <OrillaMark className={className} title={title ?? name} />;
      case "wordmark":
        return <OrillaWordmark className={className} title={title ?? name} />;
    }
  }

  return (
    <VenueFallbackIcon
      name={name}
      primaryColor={primaryColor}
      className={className}
    />
  );
}

export function hasVenueBrandAssets(slug: string): boolean {
  return slug === "orilla";
}
