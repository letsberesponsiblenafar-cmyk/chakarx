import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = JSON.parse(execFileSync(process.execPath, [path.join(root,'scripts','verify-client-pdf.cjs')], { encoding: 'utf8' }));
const file = fs.readFileSync(generated.target);
assert.equal(file.subarray(0,5).toString(), '%PDF-');
assert.ok(file.length > 100_000, 'Rendered PDF is unexpectedly small');
assert.ok(generated.pages >= 11, 'Fixed and dynamic pages are missing');
assert.ok(generated.customerTotal > 0, 'Customer price did not flow into the PDF');
assert.ok(generated.nativeHeadingFonts > 0, 'Native reference heading fonts are missing');
assert.ok(generated.vectorPatterns > 0, 'Native vector table artwork is missing');
assert.equal(generated.fullPageBitmaps, 0, 'The final PDF contains flattened page artwork');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'public','pdf-assets','client-master.json'),'utf8'));
for (const key of ['cover','letter','summary','daywise','package','hotels1','hotels2','hotels3','hotels4','inclusions','exclusions','policies','testimonials','thanks']) {
  assert.ok(Number.isInteger(manifest[key]) && manifest[key] >= 0, `${key} native artwork is missing`);
}
console.log(`PASS ${generated.pages}-page client PDF, native reference fonts and vector artwork, ${file.length} bytes, live customer total ${generated.customerTotal}`);
