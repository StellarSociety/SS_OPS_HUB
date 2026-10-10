import { Check, CheckCheck } from "lucide-react";
import type { ReceiptStatus } from "@/lib/connect/chat-receipts";
import { cn } from "@/lib/utils";

const LABELS: Record<ReceiptStatus, string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

/** ✓ sent · ✓✓ delivered · blue ✓✓ read. Sized to sit inside a bubble. */
export function MessageTicks({
  status,
  className,
}: {
  status: ReceiptStatus;
  className?: string;
}) {
  const Icon = status === "sent" ? Check : CheckCheck;
  return (
    <span
      role="img"
      aria-label={LABELS[status]}
      title={LABELS[status]}
      className={cn(
        "inline-flex shrink-0",
        status === "read" ? "text-[#53BDEB]" : "text-white/75",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
    </span>
  );
}
