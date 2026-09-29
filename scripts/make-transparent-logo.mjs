import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The master is the transparent, full-resolution logo embedded in the original
// itinerary PDF. Preserve its anti-aliased alpha rather than enlarging a crop
// from the small website screenshot.
const source = path.join(root, 'public', 'chakar-experience-logo-master.png');
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height;
for (const [name, color] of [
  ['chakar-logo-original-white.png', [255, 255, 255]],
  ['chakar-logo-original-ink.png', [37, 27, 20]],
]) {
  const pixels = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
  }
  await sharp(pixels, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(path.join(root, 'public', name));
}
