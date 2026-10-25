/* Original and Winter must share an identical layout, typography and trip data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
const jspdf = require('jspdf'), NativeJsPDF = jspdf.jsPDF;
jspdf.jsPDF = function(options) {
  const doc = new NativeJsPDF(options), text = doc.text;
  doc.drawnText = [];
  doc.text = function(value, x, y, options = {}) {
    const lines = Array.isArray(value) ? value : [String(value)];
    doc.drawnText.push({ page: doc.internal.getCurrentPageInfo().pageNumber, lines, x, y, options,
      size: doc.getFontSize(), font: doc.getFont().fontName, style: doc.getFont().fontStyle });
    return text.call(this, value, x, y, options);
  };
  return doc;
};
const { PDFDocument, PDFRawStream } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const { createPlan, rebuildPlanFromNightSequence } = require('../lib/itinerary.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { defaultPdfDesign } = require('../lib/pdf-designs.ts');
const { buildClientPdf, buildThemedClientPdf, clientPdfArtwork } = require('../components/ClientPdf.tsx');
const input = { name: 'Sample Guest', arrival: '2026-12-03', departure: '2026-12-10', pickup: 'Srinagar', adults: 6,
  youngAges: [7], budget: 0, hotelCategory: 'Signature', transport: 'Tempo Traveller', mealPlan: 'Breakfast & Dinner',
  style: 'Balanced', interests: ['Nature', 'Photography'], hotelOptionMode: 'multiple' };
const plan = rebuildPlanFromNightSequence(createPlan(input), ['Srinagar', 'Pahalgam', 'Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar', 'Gulmarg']);
const quote = { transportDaily: 8000, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {},
  activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
const selections = plan.hotelPlans.map(stay => ({ location: stay.location, hotelId: '', hotelName: `${stay.location} Heritage Hotel`,
  accommodationType: 'hotel', category: 'Signature', starRating: 4, address: '', roomType: '', website: '', nights: stay.nights,
  rooms: 3, extraBeds: 1, cnb: 0, nightlyRate: 3000, extraBedRate: 1000, cnbRate: 0, source: 'custom', status: 'user-edited',
  alternatives: [{ hotelId: '', hotelName: `${stay.location} Riverside Grand`, nightlyRate: 4500, extraBedRate: 1200, cnbRate: 0 }],
}));
const comparisons = ['Signature', 'Signature Plus', 'Signature Premium', 'Elite'].map((category, index) => {
  const scopedInput = { ...input, hotelCategory: category, transport: index === 2 ? 'Innova Crysta' : input.transport };
  const scopedPlan = { ...plan, input: scopedInput };
  const hotels = selections.map(hotel => ({ ...hotel, category, hotelName: `${category} ${hotel.hotelName}`, nightlyRate: hotel.nightlyRate + index * 1000 }));
  return { category, input: scopedInput, plan: scopedPlan, selections: hotels, quote, costs: calculateCosts(scopedPlan, hotels, quote) };
});
const dataUrl = (name, type) => `data:${type};base64,${fs.readFileSync(path.join(root, 'public', name)).toString('base64')}`;
const data = Object.fromEntries(['cover', 'letter', 'summary', 'daywise', 'package', 'hotels', 'inclusions', 'exclusions', 'policies', 'testimonials', 'thanks'].map(key => [key, '']));
Object.assign(data, { vectorBackgrounds: true, brandInk: dataUrl('chakar-logo-original-ink.png', 'image/png'), brandWhite: dataUrl('chakar-logo-original-white.png', 'image/png') });
const fonts = Object.fromEntries([['regular', 'Evolventa-Regular.ttf'], ['bold', 'Evolventa-Bold.ttf'], ['cover', 'RedHatDisplay-400.ttf']]
  .map(([key, name]) => [key, fs.readFileSync(path.join(root, 'public/fonts', name)).toString('base64')]));
const activityLists = { included: ['One-hour Shikara ride', 'Local guide'], excluded: ['Airfare', 'Personal expenses'] };
const original = defaultPdfDesign('original'), winter = defaultPdfDesign('winter');
const resolvedImages = Object.fromEntries(Object.keys(winter.images).map(key => [key, dataUrl('pdf-assets/winter/winter-cover.jpg', 'image/jpeg')]));
const masterBytes = fs.readFileSync(path.join(root, 'public/pdf-assets/client-master.pdf'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/pdf-assets/client-master.json'), 'utf8'));
async function parse(bytes) { const reader = new PDFParse({ data: bytes.slice() }); try { return (await reader.getText()).text; } finally { await reader.destroy(); } }
const flat = doc => doc.drawnText.flatMap(entry => entry.lines).join(' ').replace(/\s+/g, ' ');
function build(design, group, targetPlan = plan, lists = activityLists) {
  return buildClientPdf({ ...data, design }, targetPlan, input, selections, calculateCosts(targetPlan, selections, quote), input.name, fonts, lists, quote, group);
}
async function main() {
  const before = JSON.stringify({ plan, input, selections, comparisons });
  for (const count of [1, 2, 3, 4]) {
    const group = comparisons.slice(0, count), a = build(original, group), b = build(winter, group);
    assert.deepEqual(b.drawnText, a.drawnText, 'Only colour and imagery may change: every text coordinate, size, font and page must match');
    assert.deepEqual(clientPdfArtwork(b), clientPdfArtwork(a), 'Both themes must use the same original page masters');
    if (count > 1) for (const item of group) assert.ok(flat(b).includes(Math.round(item.costs.sellingTotal).toLocaleString('en-IN')));
  }
  const longStory = 'Enjoy the selected sightseeing at your own pace. '.repeat(130) + 'The complete final sentence remains visible.';
  const longPlan = { ...plan, dayPlans: plan.dayPlans.map((day, i) => i ? day : { ...day, customAbout: longStory }) };
  const longLists = { included: ['Included experience. '.repeat(220) + 'Complete inclusion ending.'], excluded: ['Excluded experience. '.repeat(220) + 'Complete exclusion ending.'] };
  const long = build(winter, comparisons.slice(0, 3), longPlan, longLists);
  for (const ending of ['The complete final sentence remains visible.', 'Complete inclusion ending.', 'Complete exclusion ending.']) assert.ok(flat(long).includes(ending));
  for (const entry of long.drawnText) {
    const bottom = entry.y + (entry.lines.length - 1) * entry.size * (entry.options.lineHeightFactor || 1.15);
    assert.ok(bottom <= 773, `Text must fit: ${entry.lines.join(' ').slice(0, 60)}`);
  }
  const options = { data, plan, input, selections, costs: calculateCosts(plan, selections, quote), customerName: input.name,
    fonts, activityLists, quote, masterBytes, manifest };
  const a = await buildThemedClientPdf(options);
  const b = await buildThemedClientPdf({ ...options, input: { ...input, pdfTheme: 'winter' }, resolvedImages });
  const aText = await parse(a), bText = await parse(b);
  assert.equal(aText, bText, 'Seasonal styling must preserve all original headings, business copy and trip content');
  assert.match(bText, /Discover Kashmir/);
  assert.doesNotMatch(bText, /WINTER EDITION|B2B|PROVISIONAL|Dear Asna/);
  assert.match(bText, /Sample Guest/);
  assert.match(bText, /U79110JK2024PTC015972/);
  for (const bytes of [a, b]) {
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), build(original, []).getNumberOfPages());
    assert.ok(pdf.getPages().every(page => page.getWidth() === 540 && page.getHeight() === 780));
    assert.ok(pdf.context.enumerateIndirectObjects().some(([, obj]) => /TheSeasons/.test(obj instanceof PDFRawStream ? obj.dict.toString() : obj.toString())), 'Original designer heading fonts remain native');
  }
  await assert.rejects(() => buildThemedClientPdf({ ...options, input: { ...input, pdfTheme: 'winter' } }), /design image/);
  const edited = { ...original, colors: { accent: '#A9C8D2', dark: '#1B3446' }, images: { coverMain: '/api/pdf-design-assets/' + 'a'.repeat(64) } };
  const custom = await buildThemedClientPdf({ ...options, design: edited, resolvedImages: { coverMain: resolvedImages.coverMain } });
  assert.equal(await parse(custom), aText, 'Uploaded imagery/palette may not change client content');
  assert.equal(JSON.stringify({ plan, input, selections, comparisons }), before, 'Design exports never mutate route/quote/snapshots');
  const out = path.join(root, 'tmp/pdfs'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'shared-original.pdf'), a); fs.writeFileSync(path.join(out, 'shared-winter.pdf'), b);
  fs.writeFileSync(path.join(out, 'shared-custom.pdf'), custom);
  const multi = await buildThemedClientPdf({ ...options, input: { ...input, pdfTheme: 'winter' }, resolvedImages, comparison: comparisons.slice(0, 3) });
  fs.writeFileSync(path.join(out, 'shared-winter-three-packages.pdf'), multi);
  console.log('PASS shared Original/Winter layout: identical geometry, original fonts/copy, 1-4 package quotes, real upload/palette export, complete long-text pagination and unchanged trip data.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
