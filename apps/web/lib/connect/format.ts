/** `5m`, `3h`, `Yesterday`, `4d`, then `DD-MM-YY` (house date format). */
export function formatPostTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffSec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d`;
  return formatDmy(then);
}

function formatDmy(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/** Full timestamp for hover titles: `09-10-26 14:05`. */
export function formatPostTimestamp(iso: string): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatDmy(date)} ${time}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(contentType: string): boolean {
  return /^image\/(webp|jpe?g|png|gif|avif)$/i.test(contentType);
}

export function celebrationHeadline(
  kind: "birthday" | "anniversary" | "shoutout",
  name: string,
  years: number | null,
): string {
  const first = name.trim().split(/\s+/)[0] || name;
  if (kind === "birthday") return `Happy birthday, ${first}! 🎂`;
  if (kind === "anniversary") {
    const span = years && years > 0 ? `${years} year${years === 1 ? "" : "s"}` : "another year";
    return `Happy work anniversary, ${first} — ${span} with the team! 🎉`;
  }
  return `Shout-out to ${first}! 🌟`;
}
