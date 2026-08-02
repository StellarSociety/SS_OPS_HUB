import { ClipboardList } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { UpdatedDocsRequestSendButton } from "@/components/hr/updated-docs-request-send-button";
import { Card } from "@/components/ui/card";
import type { MissingDetailItem } from "@/lib/hr/missing-details";

type MissingDetailsWidgetsProps = {
  items: MissingDetailItem[];
  title?: string;
  titleClassName?: string;
};

const defaultTitleClass = "font-serif text-base text-[#3D421F]";

export function MissingDetailsWidgets({
  items,
  title = "Missing details",
  titleClassName = defaultTitleClass,
}: MissingDetailsWidgetsProps) {
  if (items.length === 0) {
    return (
      <Card className="p-3">
        <h2 className={titleClassName}>{title}</h2>
        <p className="mt-1.5 text-xs text-black/50">
          All ON Board staff have the tracked profile fields filled in.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <ClipboardList className="h-3.5 w-3.5 text-[#3D421F]/70" />
        <h2 className={titleClassName}>{title}</h2>
        <span className="ml-auto text-[11px] text-black/50">
          {items.length} staff member{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="divide-y divide-black/5">
        {items.map((item) => (
          <li
            key={item.staffId}
            className="flex items-center gap-1.5 py-0.5 text-[11px] leading-snug text-[#3D421F]"
          >
            <div className="flex min-w-0 flex-1 items-baseline gap-x-1.5">
              <Link
                href={`/hr/${item.staffId}`}
                className="shrink-0 font-semibold text-[var(--venue-primary,#6B7B3A)] underline-offset-2 hover:underline"
              >
                {item.empNo}
              </Link>
              <span className="text-black/25" aria-hidden>
                —
              </span>
              <span className="shrink-0 font-medium">{item.fullName}</span>
              <span className="text-black/25" aria-hidden>
                —
              </span>
              <span className="min-w-0 truncate text-black/55">
                {item.labels.join(", ")}
              </span>
            </div>
            <UpdatedDocsRequestSendButton
              staffId={item.staffId}
              fullName={item.fullName}
              empNo={item.empNo}
              className="size-7"
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
