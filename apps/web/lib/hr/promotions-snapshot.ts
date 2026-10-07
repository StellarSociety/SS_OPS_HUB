/**
 * PNG snapshot of the Promotions table. Renders a dedicated off-screen
 * layout (logo, title, full table without scroll clipping) with html2canvas.
 */

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function buildPromotionsSnapshotFilename(
  venueName: string,
  viewLabel: string,
  todayIso: string,
): string {
  return `${[venueName, viewLabel, todayIso]
    .map(sanitizeFilenamePart)
    .filter(Boolean)
    .join("_")}.png`;
}

async function waitForImages(element: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}

/** html2canvas draws SVG <img> poorly; swap them for PNG data URLs first. */
async function rasterizeSvgImages(element: HTMLElement): Promise<void> {
  const svgs = Array.from(element.querySelectorAll("img")).filter((img) =>
    /\.svg($|\?)/i.test(img.currentSrc || img.src),
  );
  await Promise.all(
    svgs.map(async (img) => {
      try {
        const text = await (await fetch(img.currentSrc || img.src)).text();
        const blobUrl = URL.createObjectURL(
          new Blob([text], { type: "image/svg+xml;charset=utf-8" }),
        );
        try {
          const source = new Image();
          await new Promise<void>((resolve, reject) => {
            source.onload = () => resolve();
            source.onerror = () => reject(new Error("SVG load failed"));
            source.src = blobUrl;
          });
          const width = Math.max(img.offsetWidth, 1);
          const height = Math.max(img.offsetHeight, 1);
          const scale = 3;
          const canvas = document.createElement("canvas");
          canvas.width = width * scale;
          canvas.height = height * scale;
          canvas
            .getContext("2d")
            ?.drawImage(source, 0, 0, canvas.width, canvas.height);
          img.src = canvas.toDataURL("image/png");
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch {
        // Leave the original src; html2canvas may still manage it.
      }
    }),
  );
  await waitForImages(element);
}

export async function downloadElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas-pro");

  await waitForImages(element);
  await rasterizeSvgImages(element);

  const width = Math.ceil(element.scrollWidth);
  const height = Math.ceil(element.scrollHeight);
  if (width <= 0 || height <= 0) throw new Error("Nothing to export.");

  // Stay under browser canvas limits on very long tables.
  const scale = Math.min(2, 16_000 / Math.max(width, height));

  const canvas = await html2canvas(element, {
    scale,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode the snapshot image.");

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
