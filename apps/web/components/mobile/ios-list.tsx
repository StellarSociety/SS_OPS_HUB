"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobilePress } from "@/components/mobile/mobile-press";

/*
 * Phone building blocks modelled on iOS (HIG: Lists and tables › Style,
 * Typography › Conveying hierarchy). Sizes are in rem so they follow the
 * mobile `--ui-density` bump: at 1.22, 0.875rem ≈ 17pt body, 0.75rem ≈ 15pt
 * subheadline, 0.6875rem ≈ 13pt footnote.
 *
 * Colours: primary text #3D421F on white is 10.5:1; secondary uses black/60
 * (#666, 5.7:1) instead of black/50 (#808080, 3.9:1, below AA for small text).
 */

const SEPARATOR =
  "after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:h-px after:origin-bottom after:scale-y-50 after:bg-black/15 dark:after:bg-white/15";
/** On the row: the last row in a group drops its separator. */
const LAST_ROW = "[&:last-child>span:last-child]:after:hidden";

/** Large title: leading-aligned Playfair, the brand's one display face. */
export function IosLargeTitle({
  children,
  subtitle,
  trailing,
  className,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-end gap-3", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.01em] text-[#3D421F] dark:text-[CanvasText]">
          {children}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 pb-0.5">{trailing}</div> : null}
    </header>
  );
}

/** Capsule search field (iOS 26): filled, borderless, 16px+ text so focus never zooms. */
export function IosSearchField({
  value,
  onChange,
  placeholder = "Search",
  className,
  trailing,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <label className={cn("relative block", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-[1.05rem] w-[1.05rem] -translate-y-1/2 text-black/45 dark:text-white/45"
        strokeWidth={2.25}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 w-full appearance-none rounded-full bg-[rgb(118_118_128/0.12)] pl-9 text-sm text-[#3D421F] outline-none placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40 dark:bg-[rgb(118_118_128/0.24)] dark:text-[CanvasText] dark:placeholder:text-white/45 [&::-webkit-search-cancel-button]:hidden",
          trailing ? "pr-10" : "pr-3",
        )}
      />
      {trailing ? (
        <span className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</span>
      ) : null}
    </label>
  );
}

/**
 * List section in the iOS plain style: rows sit straight on the page (no card),
 * divided by hairlines that start at the text, as in Contacts. The screen
 * keeps the app's own background instead of a grey grouped canvas.
 */
export function IosListSection({
  header,
  headerTrailing,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  headerTrailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-6 first:mt-0", className)}>
      {header ? (
        <h2 className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-black/60 dark:text-white/60">
          {header}
          {headerTrailing ? (
            <span className="ml-auto font-normal">{headerTrailing}</span>
          ) : null}
        </h2>
      ) : null}
      <div className="-mx-4">{children}</div>
      {footer ? (
        <p className="mt-1.5 text-[0.6875rem] leading-snug text-black/60 dark:text-white/60">
          {footer}
        </p>
      ) : null}
    </section>
  );
}

type IosListRowProps = {
  title: ReactNode;
  /** Small label above the title (Contacts-style "mobile", "work"). */
  overline?: ReactNode;
  subtitle?: ReactNode;
  /** Extra line under the subtitle (e.g. department + position). */
  detail?: ReactNode;
  leading?: ReactNode;
  /** Right-hand value or accessory, before the chevron. */
  trailing?: ReactNode;
  /** Show the disclosure chevron. Defaults to true when the row navigates. */
  chevron?: boolean;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  /** Tint the row (e.g. "today" items). */
  highlighted?: boolean;
  /**
   * Separate button at the trailing edge, before the chevron (e.g. Message).
   * Sits beside the row's own tap target rather than inside it.
   */
  action?: ReactNode;
  /** Internal: leave room for an action laid over the row. */
  reserveAction?: boolean;
  className?: string;
};

/**
 * One list row. Highlights on press (after the shared 90ms scroll guard)
 * instead of scaling: the iOS table-cell feedback for navigating rows.
 */
export function IosListRow({
  title,
  overline,
  subtitle,
  detail,
  leading,
  trailing,
  chevron,
  onClick,
  href,
  external,
  highlighted,
  action,
  reserveAction,
  className,
}: IosListRowProps) {
  const interactive = Boolean(onClick || href);
  const { pressed, pressProps } = useMobilePress();
  const showChevron = chevron ?? (interactive && !external);

  const body = (
    <>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span
        className={cn(
          "relative flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2.5 pr-4",
          SEPARATOR,
          // Separator starts at the text, not the row edge.
          "after:left-0",
        )}
      >
        <span className="min-w-0 flex-1">
          {overline ? (
            <span className="mb-px block truncate text-[0.6875rem] text-black/60 dark:text-white/60">
              {overline}
            </span>
          ) : null}
          <span className="block truncate text-sm text-[#3D421F] dark:text-[CanvasText]">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-px block truncate text-xs text-black/60 dark:text-white/60">
              {subtitle}
            </span>
          ) : null}
          {detail ? (
            <span className="block truncate text-xs text-black/60 dark:text-white/60">
              {detail}
            </span>
          ) : null}
        </span>
        {trailing ? (
          <span className="shrink-0 text-right text-xs text-black/60 dark:text-white/60">
            {trailing}
          </span>
        ) : null}
        {/* Room for the action button, which is laid over this spot. */}
        {reserveAction ? <span aria-hidden className="w-9 shrink-0" /> : null}
        {showChevron ? (
          <ChevronRight
            aria-hidden
            className="-mr-1 h-[1.05rem] w-[1.05rem] shrink-0 text-black/30 dark:text-white/30"
            strokeWidth={2.5}
          />
        ) : null}
      </span>
    </>
  );

  const rowClass = cn(
    "relative flex w-full items-center gap-3 pl-4 text-left transition-colors duration-150",
    LAST_ROW,
    highlighted && "bg-[var(--venue-primary,#818a40)]/12",
    interactive && pressed && "bg-black/[0.07] duration-0 dark:bg-white/[0.1]",
    className,
  );

  if (action) {
    return (
      <div className="relative [&:last-child>:first-child>span:last-child]:after:hidden">
        <IosListRow
          {...{ title, overline, subtitle, detail, leading, trailing, chevron, onClick, href, external, highlighted, className }}
          reserveAction
        />
        <span
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 items-center",
            showChevron ? "right-[2.1rem]" : "right-3",
          )}
        >
          {action}
        </span>
      </div>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className={rowClass}
        {...pressProps}
      >
        {body}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClass} {...pressProps}>
        {body}
      </button>
    );
  }

  return <div className={rowClass}>{body}</div>;
}

/** iOS back control: chevron + previous screen's title, in the tint colour. */
export function IosBackButton({
  label,
  onClick,
  href,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pr-2 text-sm text-[var(--mobile-tint)] active:opacity-50";
  const inner = (
    <>
      <ChevronLeft aria-hidden className="h-6 w-6" strokeWidth={2.25} />
      <span className="max-w-[12rem] truncate">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

/** Rounded-square icon tile for list rows (Settings-style leading glyph). */
export function IosRowIcon({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-[1.85rem] w-[1.85rem] items-center justify-center rounded-[0.45rem] bg-[var(--venue-primary,#818a40)] text-white",
        className,
      )}
    >
      <Icon className="h-[1.1rem] w-[1.1rem]" strokeWidth={2} />
    </span>
  );
}
