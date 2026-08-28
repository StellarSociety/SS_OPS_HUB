const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1680;
const INK = "#3D421F";

export type GuestFormShareCardInput = {
  qrDataUrl: string;
  formUrl: string;
  venueName: string;
  venueLogoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
};

function cssFamily(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function loadImage(src: string, timeoutMs = 5000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.src = "";
      reject(new Error("Timed out loading image."));
    }, timeoutMs);
    image.decoding = "async";
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Could not load image."));
    };
    image.src = src;
  });
}

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function displayUrl(formUrl: string): string {
  try {
    const parsed = new URL(formUrl);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return formUrl.replace(/^https?:\/\//, "");
  }
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      value;
  }
}

function fillTextLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerX: number,
  startY: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, startY + index * lineHeight);
  });
}

export async function renderGuestFormShareCard(
  input: GuestFormShareCardInput,
): Promise<Blob> {
  await document.fonts.ready.catch(() => undefined);

  const qr = await loadImage(input.qrDataUrl);
  const logo = input.venueLogoUrl
    ? await loadImage(input.venueLogoUrl).catch(() => null)
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the share image.");

  const primary = input.primaryColor || "#818a40";
  const secondary = input.secondaryColor || "#F0F3DD";
  const serif = cssFamily("--font-playfair", "Georgia, serif");
  const sans = cssFamily("--font-inter", "system-ui, sans-serif");
  const cx = CARD_WIDTH / 2;

  ctx.fillStyle = secondary;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, CARD_WIDTH, 28);
  ctx.fillRect(0, CARD_HEIGHT - 132, CARD_WIDTH, 132);

  pathRoundRect(ctx, 48, 56, CARD_WIDTH - 96, CARD_HEIGHT - 220, 48);
  ctx.strokeStyle = "rgba(61, 66, 31, 0.12)";
  ctx.lineWidth = 3;
  ctx.stroke();

  let cursorY = 108;
  if (logo && logo.naturalWidth > 0 && logo.naturalHeight > 0) {
    const maxW = 520;
    const maxH = 110;
    const scale = Math.min(
      maxW / logo.naturalWidth,
      maxH / logo.naturalHeight,
    );
    const w = logo.naturalWidth * scale;
    const h = logo.naturalHeight * scale;
    ctx.drawImage(logo, cx - w / 2, cursorY, w, h);
    cursorY += h + 28;
  }

  ctx.fillStyle = "rgba(61, 66, 31, 0.55)";
  ctx.font = `600 22px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  setLetterSpacing(ctx, "0.22em");
  ctx.fillText(input.venueName.toUpperCase(), cx, cursorY);
  setLetterSpacing(ctx, "0px");
  cursorY += 56;

  ctx.fillStyle = INK;
  ctx.font = `500 58px ${serif}`;
  const headline = wrapText(ctx, "Scan to add your details", 820);
  fillTextLines(ctx, headline, cx, cursorY, 68);
  cursorY += headline.length * 68 + 18;

  ctx.fillStyle = "rgba(61, 66, 31, 0.58)";
  ctx.font = `400 26px ${sans}`;
  const intro = wrapText(
    ctx,
    "Point your camera here. We’ll keep your preferences for your next visit.",
    780,
  );
  fillTextLines(ctx, intro, cx, cursorY, 36);
  cursorY += intro.length * 36 + 48;

  const plate = 792;
  const plateX = (CARD_WIDTH - plate) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(61, 66, 31, 0.16)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff";
  pathRoundRect(ctx, plateX, cursorY, plate, plate, 44);
  ctx.fill();
  ctx.restore();

  const qrPad = 56;
  const qrSize = plate - qrPad * 2;
  ctx.drawImage(
    qr,
    plateX + qrPad,
    cursorY + qrPad,
    qrSize,
    qrSize,
  );
  cursorY += plate + 36;

  ctx.fillStyle = "rgba(61, 66, 31, 0.45)";
  ctx.font = `500 22px ${sans}`;
  const urlLines = wrapText(ctx, displayUrl(input.formUrl), 780);
  fillTextLines(ctx, urlLines, cx, cursorY, 30);

  ctx.fillStyle = "#ffffff";
  ctx.font = `500 26px ${sans}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Scan with your camera", cx, CARD_HEIGHT - 66);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Could not create the share image."));
    }, "image/png");
  });

  return blob;
}

export function guestFormShareFilename(venueSlug: string): string {
  const slug = venueSlug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${slug || "venue"}-guest-form.png`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function shareImageFile(options: {
  blob: Blob;
  filename: string;
  title: string;
  text: string;
}): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([options.blob], options.filename, { type: "image/png" });
  const payload = { files: [file], title: options.title, text: options.text };
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share(payload);
      return "shared";
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "cancelled";
    }
  }
  downloadBlob(options.blob, options.filename);
  return "saved";
}
