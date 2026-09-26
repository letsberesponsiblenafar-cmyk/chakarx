/* Render a representative client PDF through the same builder used by the UI. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = function (module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, resolveJsonModule: true,
    } }).outputText;
    module._compile(output, filename);
  };
}

const { createPlan, rebuildPlanFromNightSequence } = require('../lib/itinerary.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { buildClientPdf } = require('../components/ClientPdf.tsx');
const input = {
  name: 'QA Traveller', arrival: '2026-10-03', departure: '2026-10-10', pickup: 'Srinagar',
  adults: 6, youngAges: [7], budget: 0, hotelCategory: 'Signature', transport: 'Tempo Traveller',
  mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature','Photography','Relaxation'],
};
const sequence = ['Srinagar','Pahalgam','Srinagar','Pahalgam','Pahalgam','Srinagar','Gulmarg'];
const plan = rebuildPlanFromNightSequence(createPlan(input), sequence);
const selections = plan.hotelPlans.map((row) => ({
  location: row.location, hotelId: '', hotelName: `${row.location} Sample Hotel`, category: 'Signature',
  starRating: 3, address: '', roomType: '', website: '', nights: row.nights,
  rooms: 3, extraBeds: 1, cnb: 0, nightlyRate: 3000, extraBedRate: 1000, cnbRate: 0,
  source: 'PDF verification', status: 'rate entered',
}));
const costs = calculateCosts(plan, selections, { transportDaily: 8000, otherAmount: 0, profitPct: 10 });
const artFiles = {
  cover: 'asna-cover-template.png', letter: 'standard-letter.jpg', summary: 'standard-summary.jpg',
  daywise: 'standard-daywise.jpg', package: 'standard-package.jpg', hotels: 'standard-hotels.jpg',
  inclusions: 'standard-inclusions.jpg', exclusions: 'standard-exclusions.jpg', policies: 'standard-policies.jpg',
  testimonials: 'standard-testimonials.jpg', thanks: 'standard-thanks.jpg',
};
const art = Object.fromEntries(Object.entries(artFiles).map(([key, file]) => {
  const ext = path.extname(file).slice(1);
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return [key, `data:${mime};base64,${fs.readFileSync(path.join(root, 'public', 'pdf-assets', file)).toString('base64')}`];
}));
const doc = buildClientPdf(art, plan, input, selections, costs, input.name);
const target = path.join(os.tmpdir(), 'chakar-client-pdf-check.pdf');
fs.writeFileSync(target, Buffer.from(doc.output('arraybuffer')));
if (doc.getNumberOfPages() < 10 || costs.sellingTotal <= 0) throw new Error('Client PDF is incomplete.');
process.stdout.write(JSON.stringify({ target, pages: doc.getNumberOfPages(), customerTotal: Math.round(costs.sellingTotal) }) + '\n');
