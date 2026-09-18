import {
  ageFromIsoDate,
  type HiringApplication,
  type HiringFormBlock,
} from "@/lib/hr/hiring/types";

export function hiringAnswerDisplay(
  application: HiringApplication,
  block: HiringFormBlock | undefined,
): string {
  if (!block) return "";
  if (block.kind !== "field") return "";
  const answer = application.answers[block.id];
  const files = application.files.filter((file) => file.block_id === block.id);

  if (block.field_type === "picture") {
    return files[0]?.public_url || "";
  }
  if (block.field_type === "file") {
    return files.map((file) => file.file_name).join(", ");
  }

  const value = answer?.value;
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (block.field_type === "date" && typeof value === "string") {
    const display = value.split("-").reverse().join("/");
    if (block.config.computeAge) {
      const age = ageFromIsoDate(value);
      return age != null ? `${display} (${age})` : display;
    }
    return display;
  }
  return String(value);
}

export function hiringPictureUrl(
  application: HiringApplication,
  blocks: HiringFormBlock[],
): string | null {
  const picture = blocks.find((block) => block.field_type === "picture");
  if (!picture) return null;
  return (
    application.files.find((file) => file.block_id === picture.id)?.public_url ??
    null
  );
}
