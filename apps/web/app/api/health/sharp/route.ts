import { NextResponse } from "next/server";
import { convertImageToWebp, loadSharp } from "@/lib/storage/convert-to-webp";

export const dynamic = "force-dynamic";

/** 1×1 PNG — exercises convertImageToWebp without sharp({ create }). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function GET() {
  let sharpLoaded = false;
  try {
    await loadSharp();
    sharpLoaded = true;
  } catch {
    /* libvips may be missing on some deploy targets */
  }

  try {
    const webp = await convertImageToWebp(PNG_1X1);
    return NextResponse.json({
      ok: true,
      sharpLoaded,
      bytes: webp.buffer.length,
      contentType: webp.contentType,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        sharpLoaded,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 },
    );
  }
}
