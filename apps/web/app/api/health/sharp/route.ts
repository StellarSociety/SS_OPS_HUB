import { NextResponse } from "next/server";
import { convertImageToWebp, loadSharp } from "@/lib/storage/convert-to-webp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sharp = await loadSharp();
    const input = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const webp = await convertImageToWebp(input);
    return NextResponse.json({
      ok: true,
      bytes: webp.buffer.length,
      contentType: webp.contentType,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 },
    );
  }
}
