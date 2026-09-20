import {
  ageFromIsoDate,
  type HiringAnswerValue,
  type HiringApplication,
  type HiringApplicationFile,
  type HiringFieldType,
  type HiringFormBlock,
} from "@/lib/hr/hiring/types";

export function hiringFieldAnswerText(input: {
  value: HiringAnswerValue | undefined;
  files: HiringApplicationFile[];
  fieldType: HiringFieldType | null;
  computeAge?: boolean;
}): string {
  const { value, files, fieldType, computeAge } = input;
  if (fieldType === "picture") {
    return files[0]?.public_url || "";
  }
  if (fieldType === "file") {
    return files.map((file) => file.file_name).join(", ");
  }
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (fieldType === "date" && typeof value === "string") {
    const display = value.split("-").reverse().join("/");
    if (computeAge) {
      const age = ageFromIsoDate(value);
      return age != null ? `${display} (${age})` : display;
    }
    return display;
  }
  return String(value);
}

export function hiringAnswerDisplay(
  application: HiringApplication,
  block: HiringFormBlock | undefined,
): string {
  if (!block) return "";
  if (block.kind !== "field") return "";
  return hiringFieldAnswerText({
    value: application.answers[block.id]?.value,
    files: application.files.filter((file) => file.block_id === block.id),
    fieldType: block.field_type,
    computeAge: block.config.computeAge,
  });
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
