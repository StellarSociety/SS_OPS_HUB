/** WhatsApp-style ticks for the viewer's own messages. */
export type ReceiptStatus = "sent" | "delivered" | "read";

/** For each other member: when they last read the chat and last had the app open. */
export type ChatReceipts = {
  userId: string;
  readAt: string | null;
  seenAt: string | null;
}[];

/**
 * Read once every other member's read time is at or after the message;
 * delivered once every other member has had the app open since it was sent.
 */
export function receiptStatus(createdAt: string, receipts: ChatReceipts | null): ReceiptStatus {
  if (!receipts || receipts.length === 0) return "sent";
  const at = new Date(createdAt).getTime();
  const after = (iso: string | null) => iso != null && new Date(iso).getTime() >= at;
  if (receipts.every((r) => after(r.readAt))) return "read";
  if (receipts.every((r) => after(r.readAt) || after(r.seenAt))) return "delivered";
  return "sent";
}
