import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const modulesDir = path.join(process.cwd(), "public/modules");

function isBackground(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;

  // AI-generated icons often ship on solid black
  if (max <= 42 && spread <= 18) return true;

  // Near-white / cream checkerboard leftovers
  if (max > 245 && spread < 14) return true;
  if (max > 232 && spread < 22 && min > 215) return true;
  if (r > 228 && g > 226 && b > 205 && spread < 28) return true;

  return false;
}

async function processIcon(file) {
  const input = path.join(modulesDir, file);
  const tmp = input.replace(/\.png$/, ".tmp.png");

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (isBackground(r, g, b)) {
      pixels[i + 3] = 0;
    }
  }

  await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 12 })
    .resize(128, 128, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, force: true })
    .toFile(tmp);

  await sharp(tmp).toFile(input);
  await unlink(tmp);
}

const files = (await readdir(modulesDir)).filter(
  (f) => f.endsWith(".png") && !f.startsWith("ORILLA"),
);

for (const file of files) {
  await processIcon(file);
  const meta = await sharp(path.join(modulesDir, file)).metadata();
  console.log(`processed ${file} (${meta.width}x${meta.height}, alpha: ${meta.hasAlpha})`);
}
