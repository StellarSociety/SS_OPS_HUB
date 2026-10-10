import { Fragment, type ReactNode } from "react";
import { splitMentions } from "@/lib/connect/mentions";
import { cn } from "@/lib/utils";

/**
 * Stored text with @mention tags rendered as highlighted names. Plain runs go
 * through `renderText` (e.g. to linkify or highlight a search).
 */
export function MentionText({
  text,
  onDark = false,
  renderText = (run) => run,
}: {
  text: string;
  /** On a coloured bubble (your own chat messages). */
  onDark?: boolean;
  renderText?: (run: string) => ReactNode;
}) {
  return (
    <>
      {splitMentions(text).map((segment, i) =>
        segment.kind === "mention" ? (
          <span
            key={i}
            className={cn(
              "rounded px-0.5 font-semibold",
              onDark ? "bg-white/20 text-white" : "bg-[var(--venue-primary,#818a40)]/12 text-[var(--venue-primary,#818a40)]",
            )}
          >
            @{segment.name}
          </span>
        ) : (
          <Fragment key={i}>{renderText(segment.text)}</Fragment>
        ),
      )}
    </>
  );
}
