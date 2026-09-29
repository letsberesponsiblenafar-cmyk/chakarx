import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'chakar-experience-logo.png');
// The supplied original has a dark photographic background and unrelated
// artwork beneath the lockup. This crop contains only the original monogram
// and lettering; the blue channel cleanly separates the white art from brown.
const crop = { left: 28, top: 23, width: 168, height: 61 };
const { data, info } = await sharp(source).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height;
const mask = new Uint8Array(w * h);
for (let i = 0; i < mask.length; i++) mask[i] = data[i * 3 + 2] > 115 ? 1 : 0;
const dilated = new Uint8Array(mask.length);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  for (let dy = -1; dy <= 1 && !dilated[y * w + x]; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && mask[(y + dy) * w + x + dx]) { dilated[y * w + x] = 1; break; }
}
const closed = new Uint8Array(mask.length);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  let all = true;
  for (let dy = -1; dy <= 1 && all; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && !dilated[(y + dy) * w + x + dx]) { all = false; break; }
  closed[y * w + x] = all ? 1 : 0;
}
for (const [name, color] of [
  ['chakar-experience-logo-white.png', [255, 255, 255]],
  ['chakar-experience-logo-ink.png', [37, 27, 20]],
]) {
  const pixels = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const alpha = closed[i] ? 255 : 0;
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
    pixels[i * 4 + 3] = alpha;
  }
  await sharp(pixels, { raw: { width: w, height: h, channels: 4 } })
    .resize({ width: 672, kernel: 'lanczos3' })
    .png()
    .toFile(path.join(root, 'public', name));
}
