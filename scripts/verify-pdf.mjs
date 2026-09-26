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
for (const name of ['letter','summary','daywise','package','hotels','inclusions','exclusions','policies','testimonials','thanks']) {
  assert.ok(fs.existsSync(path.join(root,'public','pdf-assets',`standard-${name}.jpg`)), `${name} artwork is missing`);
}
console.log(`PASS ${generated.pages}-page client PDF, ${file.length} bytes, live customer total ${generated.customerTotal}`);
