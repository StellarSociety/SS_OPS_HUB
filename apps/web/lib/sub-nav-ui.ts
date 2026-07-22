import { cn } from "@/lib/utils";

/** DM Sans — distinct from body (Inter) and headings (Playfair). */
export const subNavLabelClass =
  "font-nav text-sm font-semibold uppercase tracking-[0.08em]";

export function moduleBrandedNavLinkClass(
  active: boolean,
  options?: { fullWidth?: boolean },
) {
  return cn(
    "flex h-[46px] items-center gap-1.5 rounded-lg border px-3 shadow-sm backdrop-blur-md transition-colors",
    options?.fullWidth ? "w-full" : "inline-flex shrink-0",
    subNavLabelClass,
    active
      ? "border-[var(--venue-primary)]/35 bg-[var(--venue-primary)]/15 text-[#3D421F] ring-1 ring-[var(--venue-primary)]/10"
      : "border-[var(--venue-primary)]/20 bg-[var(--venue-primary)]/8 text-black/55 hover:border-[var(--venue-primary)]/30 hover:bg-[var(--venue-primary)]/12 hover:text-[#3D421F]",
  );
}

export function moduleBrandedNavIconClass(active: boolean) {
  return cn(
    "h-3.5 w-3.5 shrink-0",
    active
      ? "text-[var(--venue-primary,#818a40)]"
      : "text-[var(--venue-primary,#818a40)]/70",
  );
}

export const segmentedSubNavShellClass =
  "flex w-full overflow-hidden rounded-lg border border-black/10 bg-white/60 backdrop-blur-md";

export const pillSubNavShellClass =
  "flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/50 p-1.5";

export function segmentedSubNavLinkClass(active: boolean) {
  return cn(
    "flex min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 whitespace-nowrap border-r border-black/10 px-2 py-2.5 transition-colors last:border-r-0 sm:px-3",
    subNavLabelClass,
    active
      ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
      : "text-black/55 hover:bg-black/[0.03] hover:text-[#3D421F]",
  );
}

export function pillSubNavLinkClass(active: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors",
    subNavLabelClass,
    active
      ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
      : "text-black/55 hover:bg-black/5 hover:text-[#3D421F]",
  );
}
