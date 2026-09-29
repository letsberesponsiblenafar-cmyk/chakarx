import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'pdf-assets');
const jobs = [
  { input: 'asna-cover-template.png', output: 'branded-cover.png', target: [24, 8, 434, 164], sample: [24, 560] },
  { input: 'standard-letter.jpg', output: 'branded-letter.jpg', target: [5, 5, 190, 105], sample: [235, 5] },
  ...['summary','package','hotels','inclusions','exclusions','policies','testimonials'].map((key) => ({
    input: `standard-${key}.jpg`, output: `branded-${key}.jpg`, target: [865, 6, 206, 104], sample: [620, 6],
  })),
];

for (const job of jobs) {
  const image = sharp(path.join(dir, job.input));
  const [left, top, width, height] = job.target;
  const [sampleLeft, sampleTop] = job.sample;
  const swatch = await sharp(path.join(dir, job.input)).extract({ left: sampleLeft, top: sampleTop, width, height }).ensureAlpha().raw().toBuffer();
  const edge = job.input.includes('cover') ? 20 : 13;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const distance = Math.min(x, y, width - 1 - x, height - 1 - y);
    swatch[(y * width + x) * 4 + 3] = Math.max(0, Math.min(255, Math.round(distance * 255 / edge)));
  }
  const patch = await sharp(swatch, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const composed = image.composite([{ input: patch, left, top }]);
  if (job.output.endsWith('.png')) await composed.png().toFile(path.join(dir, job.output));
  else await composed.jpeg({ quality: 94, mozjpeg: true }).toFile(path.join(dir, job.output));
}
