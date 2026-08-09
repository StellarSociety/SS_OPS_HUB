"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { computeAge, computeWorkedTime } from "@/lib/hr/derived";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import { staffPhotoSourceUrlFromCropUrl } from "@/lib/hr/staff-photo-constants";
import { cn } from "@/lib/utils";

export type StaffPhotoDetails = {
  empNo?: string | null;
  department?: string | null;
  position?: string | null;
  employeeStatus?: string | null;
  workingStatus?: string | null;
  nationality?: string | null;
  dob?: string | null;
  joiningDate?: string | null;
  terminationDate?: string | null;
};

type StaffPhotoThumbnailProps = {
  fullName: string;
  photoUrl: string | null | undefined;
  className?: string;
  /** `fill` stretches to the parent row height (use with items-stretch). */
  size?: "sm" | "md" | "fill";
  /** Shown under the enlarged photo in the zoom lightbox. */
  empNo?: string | null;
  department?: string | null;
  position?: string | null;
  employeeStatus?: string | null;
  workingStatus?: string | null;
  nationality?: string | null;
  dob?: string | null;
  joiningDate?: string | null;
  terminationDate?: string | null;
};

type OriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const DETAILS_PANEL_HEIGHT = 220;
const DETAILS_GAP = 12;
const LIGHTBOX_BG = "bg-[#2c2c2c]";
const LIGHTBOX_DETAILS_BG = "bg-[#2c2c2c]/95";

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

/** Cleaner photo mark than Lucide at large lightbox sizes. */
function PhotoPlaceholderMark({
  className,
  tone = "muted",
}: {
  className?: string;
  tone?: "muted" | "bright";
}) {
  const stroke = tone === "bright" ? "stroke-white/75" : "stroke-white/50";
  const fill = tone === "bright" ? "fill-white/70" : "fill-white/45";
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect
        x="8"
        y="12"
        width="48"
        height="40"
        rx="8"
        className={stroke}
        strokeWidth="2.75"
      />
      <circle cx="24" cy="26" r="5" className={fill} />
      <path
        d="M12 46V40.5L23 29.5L31.5 38L39 30.5L52 43.5V46H12Z"
        className={fill}
      />
    </svg>
  );
}

function rectFromElement(el: Element): OriginRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function centeredPreviewRect(): OriginRect {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0;
  const viewportOffsetLeft = window.visualViewport?.offsetLeft ?? 0;
  const max = Math.min(360, viewportWidth - 48, viewportHeight - 48);
  const photoSize = Math.min(
    max,
    viewportHeight - 48 - DETAILS_PANEL_HEIGHT - DETAILS_GAP,
  );
  const totalHeight = photoSize + DETAILS_GAP + DETAILS_PANEL_HEIGHT;
  return {
    width: photoSize,
    height: photoSize,
    top: viewportOffsetTop + (viewportHeight - totalHeight) / 2,
    left: viewportOffsetLeft + (viewportWidth - photoSize) / 2,
  };
}

/** Compact staff photo for employee list rows; falls back to image icon. */
export function StaffPhotoThumbnail({
  fullName,
  photoUrl,
  className,
  size = "md",
  empNo,
  department,
  position,
  employeeStatus,
  workingStatus,
  nationality,
  dob,
  joiningDate,
  terminationDate,
}: StaffPhotoThumbnailProps) {
  const titleId = useId();
  const [origin, setOrigin] = useState<OriginRect | null>(null);
  const [mounted, setMounted] = useState(false);

  const sizeClass =
    size === "fill"
      ? "h-auto w-12 self-stretch text-xs"
      : size === "sm"
        ? "h-9 w-9 text-[10px]"
        : "h-10 w-10 text-[10px]";

  const shellClass = cn(
    "relative shrink-0 overflow-hidden rounded-lg border border-black/10 bg-[#3D421F] font-medium text-white",
    sizeClass,
    className,
  );

  const cropUrl = photoUrl?.trim() || null;
  const sourceUrl = staffPhotoSourceUrlFromCropUrl(cropUrl);

  useEffect(() => {
    setMounted(true);
  }, []);

  function openPreview(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOrigin(rectFromElement(event.currentTarget));
  }

  const media = cropUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- staff photo URL from storage
    <img
      src={cropUrl}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      draggable={false}
    />
  ) : (
    <span
      className="flex h-full min-h-full w-full items-center justify-center"
      aria-hidden
    >
      <PhotoPlaceholderMark
        className="h-[48%] w-[48%] min-h-3.5 min-w-3.5 max-h-8 max-w-8"
        tone="muted"
      />
    </span>
  );

  return (
    <>
      <button
        type="button"
        className={cn(
          shellClass,
          "cursor-zoom-in p-0 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/50",
          origin && "invisible",
        )}
        aria-label={
          cropUrl
            ? `Enlarge photo of ${fullName}`
            : `View profile details for ${fullName}`
        }
        onClick={openPreview}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {media}
      </button>

      {mounted && origin
        ? createPortal(
            <StaffPhotoLightbox
              fullName={fullName}
              photoUrl={sourceUrl ?? cropUrl}
              fallbackUrl={cropUrl}
              origin={origin}
              titleId={titleId}
              details={{
                empNo,
                department,
                position,
                employeeStatus,
                workingStatus,
                nationality,
                dob,
                joiningDate,
                terminationDate,
              }}
              onClose={() => setOrigin(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-center gap-2 text-sm leading-snug">
      <span className="shrink-0 text-white/55">{label}</span>
      <span className="min-w-0 truncate text-white/95">{value}</span>
    </div>
  );
}

function StaffPhotoLightbox({
  fullName,
  photoUrl,
  fallbackUrl,
  origin,
  titleId,
  details,
  onClose,
}: {
  fullName: string;
  photoUrl: string | null;
  fallbackUrl: string | null;
  origin: OriginRect;
  titleId: string;
  details: StaffPhotoDetails;
  onClose: () => void;
}) {
  const hasPhoto = Boolean(photoUrl);
  const [src, setSrc] = useState(photoUrl ?? "");
  const [loaded, setLoaded] = useState(!hasPhoto);
  const [closing, setClosing] = useState(false);
  const [target] = useState(centeredPreviewRect);

  const nationality = nationalityDisplay(details.nationality);
  const age = computeAge(details.dob);
  const employmentTime = computeWorkedTime(
    details.joiningDate,
    details.terminationDate,
  );

  function requestClose() {
    setClosing(true);
  }

  function markLoaded() {
    setLoaded(true);
  }

  function bindImage(el: HTMLImageElement | null) {
    if (!el) return;
    // Cached images may finish before onLoad is attached.
    if (el.complete && el.naturalWidth > 0) {
      markLoaded();
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setClosing(true);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const frame = closing ? origin : target;
  const showPlaceholder = !hasPhoto || !loaded;

  return (
    <div className="fixed inset-0 z-[300]" role="presentation">
      <motion.button
        type="button"
        aria-label="Close photo"
        className="absolute inset-0 bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        onClick={requestClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={hasPhoto && !loaded}
        className={cn(
          "pointer-events-auto fixed overflow-hidden border border-white/10 shadow-2xl",
          LIGHTBOX_BG,
        )}
        initial={{
          top: origin.top,
          left: origin.left,
          width: origin.width,
          height: origin.height,
          borderRadius: 8,
        }}
        animate={{
          top: frame.top,
          left: frame.left,
          width: frame.width,
          height: frame.height,
          borderRadius: closing ? 8 : 16,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.85 }}
        onAnimationComplete={() => {
          if (closing) onClose();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {fullName}
        </h2>
        {showPlaceholder ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <div className="flex h-[56%] w-[56%] max-h-52 max-w-52 items-center justify-center rounded-[1.75rem] border border-white/15 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <PhotoPlaceholderMark
                className="h-[58%] w-[58%]"
                tone="bright"
              />
            </div>
          </div>
        ) : null}
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- staff photo URL from storage
          <img
            key={src}
            ref={bindImage}
            src={src}
            alt={fullName}
            className={cn(
              "relative h-full w-full object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
            draggable={false}
            onLoad={markLoaded}
            onError={() => {
              if (fallbackUrl && src !== fallbackUrl) {
                setLoaded(false);
                setSrc(fallbackUrl);
                return;
              }
              markLoaded();
            }}
          />
        ) : null}
      </motion.div>

      <motion.div
        className={cn(
          "pointer-events-none fixed z-[301] overflow-hidden rounded-2xl border border-white/10 px-4 py-3 shadow-xl backdrop-blur-sm",
          LIGHTBOX_DETAILS_BG,
        )}
        initial={{
          opacity: 0,
          top: origin.top + origin.height + 4,
          left: origin.left,
          width: Math.max(origin.width, 160),
        }}
        animate={{
          opacity: closing ? 0 : 1,
          top: target.top + target.height + DETAILS_GAP,
          left: target.left,
          width: target.width,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.85 }}
        aria-hidden={closing}
      >
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="w-full truncate font-serif text-xl font-semibold leading-tight tracking-tight text-white sm:text-2xl">
            {displayValue(fullName)}
          </p>
          <p className="w-full truncate text-xs tabular-nums text-white/65">
            {displayValue(details.empNo)}
          </p>
          <p className="flex w-full min-w-0 items-center justify-center gap-1.5 truncate text-xs text-white/75">
            {nationality?.flag ? (
              <span className="text-base leading-none" aria-hidden>
                {nationality.flag}
              </span>
            ) : null}
            <span className="truncate">{nationality?.label ?? "—"}</span>
          </p>
          <p className="w-full truncate text-xs tabular-nums text-white/75">
            {age != null ? `${age} years old` : "—"}
          </p>
          <div
            className="w-2/3 shrink-0 border-t border-white/40"
            aria-hidden
          />
          <p className="w-full truncate text-xs tabular-nums text-white/75">
            {employmentTime ? `Emp. time ${employmentTime}` : "—"}
          </p>
          <DetailRow
            label="Department"
            value={displayValue(details.department)}
          />
          <DetailRow
            label="Position"
            value={displayValue(details.position)}
          />
          <DetailRow
            label="Employee status"
            value={displayValue(details.employeeStatus)}
          />
          <DetailRow
            label="Working status"
            value={displayValue(details.workingStatus)}
          />
        </div>
      </motion.div>
    </div>
  );
}
