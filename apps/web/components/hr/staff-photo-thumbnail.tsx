"use client";

import {
  useEffect,
  useId,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Mail, Phone } from "lucide-react";
import { computeAge, computeWorkedTime } from "@/lib/hr/derived";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import { staffPhotoSourceUrlFromCropUrl } from "@/lib/hr/staff-photo-constants";
import {
  directoryWhatsappUrl,
  mailtoUrl,
  phoneTelUrl,
} from "@/lib/directory/links";
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
  contactPhone?: string | null;
  whatsapp?: string | null;
  personalEmail?: string | null;
  workEmail?: string | null;
};

/** Map a directory / org-chart person onto the photo lightbox fields. */
export function staffPhotoDetailsFromDirectoryMember(member: {
  empNo?: string | null;
  departmentName?: string | null;
  positionName?: string | null;
  employmentStatusName?: string | null;
  workingStatusName?: string | null;
  nationalityName?: string | null;
  dob?: string | null;
  joiningDate?: string | null;
  terminationDate?: string | null;
  contactPhone?: string | null;
  whatsapp?: string | null;
  personalEmail?: string | null;
  workEmail?: string | null;
}): StaffPhotoDetails {
  return {
    empNo: member.empNo,
    department: member.departmentName,
    position: member.positionName,
    employeeStatus: member.employmentStatusName,
    workingStatus: member.workingStatusName,
    nationality: member.nationalityName,
    dob: member.dob,
    joiningDate: member.joiningDate,
    terminationDate: member.terminationDate,
    contactPhone: member.contactPhone,
    whatsapp: member.whatsapp,
    personalEmail: member.personalEmail,
    workEmail: member.workEmail,
  };
}

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
  contactPhone?: string | null;
  whatsapp?: string | null;
  personalEmail?: string | null;
  workEmail?: string | null;
};

type OriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const DETAILS_PANEL_HEIGHT = 360;
const DETAILS_GAP = 12;
const PHOTO_MAX = 280;
const LIGHTBOX_BG = "bg-[#2c2c2c]";
const LIGHTBOX_DETAILS_BG = "bg-[#2c2c2c]/95";

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

/** Cleaner photo mark than Lucide at large lightbox sizes. */
export function PhotoPlaceholderMark({
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

function originInHost(el: Element, host: HTMLElement): OriginRect {
  const a = el.getBoundingClientRect();
  const b = host.getBoundingClientRect();
  const scaleX = b.width / (host.clientWidth || 1) || 1;
  const scaleY = b.height / (host.clientHeight || 1) || 1;
  return {
    top: (a.top - b.top) / scaleY,
    left: (a.left - b.left) / scaleX,
    width: a.width / scaleX,
    height: a.height / scaleY,
  };
}

function previewPortalHost(from: Element): HTMLElement {
  return (
    from.closest<HTMLElement>("[data-mobile-shell]") ??
    from.closest<HTMLElement>(".mobile-app-canvas") ??
    from.closest<HTMLElement>(".device-preview-screen") ??
    document.body
  );
}

function centeredPreviewRect(host?: HTMLElement | null): OriginRect {
  const nested = Boolean(host && host !== document.body);
  const viewportHeight = nested
    ? host!.clientHeight
    : (window.visualViewport?.height ?? window.innerHeight);
  const viewportWidth = nested
    ? host!.clientWidth
    : (window.visualViewport?.width ?? window.innerWidth);
  const viewportOffsetTop = nested
    ? 0
    : (window.visualViewport?.offsetTop ?? 0);
  const viewportOffsetLeft = nested
    ? 0
    : (window.visualViewport?.offsetLeft ?? 0);
  const max = Math.min(PHOTO_MAX, viewportWidth - 48, viewportHeight - 48);
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

/** Opens the staff photo / details lightbox from any custom trigger. */
export function StaffPhotoPreview({
  fullName,
  photoUrl,
  details,
  children,
}: {
  fullName: string;
  photoUrl: string | null | undefined;
  details?: StaffPhotoDetails;
  children: (helpers: {
    openPreview: (event: MouseEvent<HTMLElement>) => void;
    isOpen: boolean;
  }) => ReactNode;
}) {
  const titleId = useId();
  const [origin, setOrigin] = useState<OriginRect | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const cropUrl = photoUrl?.trim() || null;
  const sourceUrl = staffPhotoSourceUrlFromCropUrl(cropUrl);

  useEffect(() => {
    setMounted(true);
  }, []);

  function openPreview(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget;
    const host = previewPortalHost(trigger);
    const rect =
      host === document.body
        ? rectFromElement(trigger)
        : originInHost(trigger, host);
    // Let the opening click finish before the overlay is in the DOM, so it
    // cannot receive the same pointer event and immediately close.
    window.setTimeout(() => {
      setPortalHost(host);
      setOrigin(rect);
    }, 0);
  }

  return (
    <>
      {children({ openPreview, isOpen: Boolean(origin) })}
      {mounted && origin && portalHost
        ? createPortal(
            <StaffPhotoLightbox
              fullName={fullName}
              photoUrl={sourceUrl ?? cropUrl}
              fallbackUrl={cropUrl}
              origin={origin}
              host={portalHost}
              titleId={titleId}
              details={details ?? {}}
              onClose={() => {
                setOrigin(null);
                setPortalHost(null);
              }}
            />,
            portalHost,
          )
        : null}
    </>
  );
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
  contactPhone,
  whatsapp,
  personalEmail,
  workEmail,
}: StaffPhotoThumbnailProps) {
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
    <StaffPhotoPreview
      fullName={fullName}
      photoUrl={photoUrl}
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
        contactPhone,
        whatsapp,
        personalEmail,
        workEmail,
      }}
    >
      {({ openPreview, isOpen }) => (
        <button
          type="button"
          className={cn(
            shellClass,
            "cursor-zoom-in p-0 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/50",
            isOpen && "invisible",
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
      )}
    </StaffPhotoPreview>
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

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-1.99.522.522-1.93-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ContactRow({
  label,
  value,
  href,
  external,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  href?: string | null;
  external?: boolean;
  icon: ReactNode;
}) {
  const display = displayValue(value);
  const linked = Boolean(href);
  const content = (
    <div className="flex w-full min-w-0 flex-col items-center gap-0.5 text-sm leading-snug">
      <span className="shrink-0 text-white/55">{label}</span>
      <span className="inline-flex max-w-full min-w-0 items-center justify-center gap-1.5 text-white/95">
        {linked ? (
          <span className="shrink-0 text-white/80" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 break-all text-center">{display}</span>
      </span>
    </div>
  );

  if (!href) return content;

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="w-full underline-offset-2 hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  );
}

function StaffPhotoLightbox({
  fullName,
  photoUrl,
  fallbackUrl,
  origin,
  host,
  titleId,
  details,
  onClose,
}: {
  fullName: string;
  photoUrl: string | null;
  fallbackUrl: string | null;
  origin: OriginRect;
  host: HTMLElement;
  titleId: string;
  details: StaffPhotoDetails;
  onClose: () => void;
}) {
  const hasPhoto = Boolean(photoUrl);
  const [src, setSrc] = useState(photoUrl ?? "");
  const [loaded, setLoaded] = useState(!hasPhoto);
  const [closing, setClosing] = useState(false);
  const [overlayReady, setOverlayReady] = useState(false);
  const [target] = useState(() => centeredPreviewRect(host));
  const nested = host !== document.body;
  const layerClass = nested ? "absolute inset-0" : "fixed inset-0";

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
    const readyTimer = window.setTimeout(() => setOverlayReady(true), 80);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(readyTimer);
    };
  }, []);

  const frame = closing ? origin : target;
  const showPlaceholder = !hasPhoto || !loaded;

  return (
    <div className={cn(layerClass, "z-[400]")} role="presentation">
      <motion.button
        type="button"
        aria-label="Close photo"
        className={cn(
          "absolute inset-0 bg-black/60",
          !overlayReady && "pointer-events-none",
        )}
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
          "pointer-events-auto overflow-hidden border border-white/10 shadow-2xl",
          nested ? "absolute" : "fixed",
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
          "pointer-events-auto z-[401] max-h-[360px] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 px-4 py-3 shadow-xl backdrop-blur-sm",
          nested ? "absolute" : "fixed",
          LIGHTBOX_DETAILS_BG,
        )}
        onClick={(event) => event.stopPropagation()}
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
        <div className="flex flex-col items-center gap-1 text-center">
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
          <div
            className="w-2/3 shrink-0 border-t border-white/40"
            aria-hidden
          />
          <ContactRow
            label="Phone"
            value={details.contactPhone}
            href={phoneTelUrl(details.contactPhone)}
            icon={<Phone className="h-3.5 w-3.5" strokeWidth={2} />}
          />
          <ContactRow
            label="WhatsApp"
            value={details.whatsapp}
            href={directoryWhatsappUrl(details.whatsapp)}
            external
            icon={<WhatsAppGlyph className="h-3.5 w-3.5" />}
          />
          <ContactRow
            label="Personal email"
            value={details.personalEmail}
            href={mailtoUrl(details.personalEmail)}
            icon={<Mail className="h-3.5 w-3.5" strokeWidth={2} />}
          />
          <ContactRow
            label="Work email"
            value={details.workEmail}
            href={mailtoUrl(details.workEmail)}
            icon={<Mail className="h-3.5 w-3.5" strokeWidth={2} />}
          />
        </div>
      </motion.div>
    </div>
  );
}
