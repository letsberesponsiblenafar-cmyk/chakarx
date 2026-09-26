import assert from 'node:assert/strict';
import fs from 'node:fs';

const pdf = fs.readFileSync(new URL('../components/ClientPdf.tsx', import.meta.url), 'utf8');
const pricing = fs.readFileSync(new URL('../lib/pricing.ts', import.meta.url), 'utf8');

for (const filename of [
  'madiha-cover-template.png', 'madiha-policies-template.png',
  'asna-cover-template.png', 'asna-policies-template.png',
]) {
  const asset = new URL(`../public/pdf-assets/${filename}`, import.meta.url);
  assert.ok(fs.existsSync(asset), `${filename} is missing`);
  assert.ok(fs.statSync(asset).size > 100_000, `${filename} is unexpectedly small`);
  assert.ok(pdf.includes(filename), `${filename} is not used by the generator`);
}
assert.ok(pdf.includes('publicImageDataUrl(selectedTemplate.cover)'), 'Cover must be fetched before jsPDF addImage');
assert.ok(pdf.includes('publicImageDataUrl(selectedTemplate.policies)'), 'Policies must be fetched before jsPDF addImage');
assert.ok(pdf.includes('calculateCosts(plan, hotelSelections, costModel)'), 'PDF must use the live Costing calculation');
assert.ok(pdf.includes('paymentAmounts(currentCosts.sellingTotal'), 'PDF must calculate instalments from the live selling total');
assert.ok(pricing.includes('Math.round(total) - booking - arrival'), 'Payment balance must absorb rounding');
assert.ok(pdf.includes('blob.size < 1024') && pdf.includes('anchor.download'), 'PDF download guard is missing');
console.log('PASS PDF assets, live pricing, payment balance and browser download checks');
