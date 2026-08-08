import { cn } from "@/lib/utils";

type StaffPhotoThumbnailProps = {
  fullName: string;
  photoUrl: string | null | undefined;
  className?: string;
  /** `fill` stretches to the parent row height (use with items-stretch). */
  size?: "sm" | "md" | "fill";
};

function staffInitials(fullName: string): string {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Compact staff photo for employee list rows; falls back to initials. */
export function StaffPhotoThumbnail({
  fullName,
  photoUrl,
  className,
  size = "md",
}: StaffPhotoThumbnailProps) {
  const sizeClass =
    size === "fill"
      ? "h-auto w-12 self-stretch text-xs"
      : size === "sm"
        ? "h-9 w-9 text-[10px]"
        : "h-10 w-10 text-[10px]";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border border-black/10 bg-[#3D421F] font-medium text-white",
        sizeClass,
        className,
      )}
      aria-hidden
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- staff photo URL from storage
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full min-h-full w-full items-center justify-center">
          {staffInitials(fullName)}
        </span>
      )}
    </div>
  );
}
