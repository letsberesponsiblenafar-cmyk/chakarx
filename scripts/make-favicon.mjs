import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The original full-resolution artwork has an 8px gap around the CH circle in
// this square. The crop ends before the CHAKAR wordmark begins at x=222.
const monogram = { left: 4, top: 4, width: 215, height: 215 };
for (const color of ['ink', 'white']) {
  await sharp(path.join(root, 'public', `chakar-logo-original-${color}.png`))
    .extract(monogram)
    .png()
    .toFile(path.join(root, 'public', `chakar-favicon-${color}.png`));
}
