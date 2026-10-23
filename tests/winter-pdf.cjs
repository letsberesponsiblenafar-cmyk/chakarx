/* Exercise the real Winter renderer, embedded fonts, PDF bytes and production dispatcher. */
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
const jspdf = require('jspdf');
const NativeJsPDF = jspdf.jsPDF;
jspdf.jsPDF = function(options) {
  const doc = new NativeJsPDF(options), text = doc.text, rect = doc.rect, clip = doc.clip;
  doc.drawnText = [];
  doc.drawnRects = [];
  doc.clippedRects = [];
  doc.rect = function(x, y, width, height, style) {
    doc.drawnRects.push({ page: doc.internal.getCurrentPageInfo().pageNumber, x, y, width, height, style });
    return rect.call(this, x, y, width, height, style);
  };
  doc.clip = function(...args) {
    doc.clippedRects.push(doc.drawnRects.at(-1));
    return clip.apply(this, args);
  };
  doc.text = function(value, x, y, options = {}) {
    const lines = Array.isArray(value) ? value : [String(value)];
    doc.drawnText.push({ page: doc.internal.getCurrentPageInfo().pageNumber, lines, x, y, options,
      size: doc.getFontSize(), font: doc.getFont().fontName, bold: doc.getFont().fontStyle === 'bold', widths: lines.map(line => doc.getTextWidth(String(line))) });
    return text.call(this, value, x, y, options);
  };
  return doc;
};
const { PDFDocument, PDFDict, PDFName, PDFRawStream } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const { createPlan, rebuildPlanFromNightSequence } = require('../lib/itinerary.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { accommodationDayNarrative } = require('../lib/accommodation.ts');
const { buildWinterClientPdf } = require('../lib/winter-pdf.ts');
const { winterStaticCopy } = require('../lib/winter-static-copy.ts');
const { buildThemedClientPdf } = require('../components/ClientPdf.tsx');
const input = { name: 'Winter Traveller', arrival: '2026-12-03', departure: '2026-12-10', pickup: 'Srinagar', adults: 6,
  youngAges: [7], budget: 0, hotelCategory: 'Signature', transport: 'Tempo Traveller', mealPlan: 'Breakfast & Dinner',
  style: 'Balanced', interests: ['Nature', 'Photography'], hotelOptionMode: 'multiple', pdfTheme: 'winter', pdfThemeVersion: 1 };
const plan = rebuildPlanFromNightSequence(createPlan(input), ['Srinagar', 'Pahalgam', 'Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar', 'Gulmarg']);
const model = { transportDaily: 8000, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {},
  activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
const srinagarNights = plan.dayPlans.slice(0, plan.nights).filter(day => day.stay === 'Srinagar').map(day => day.day);
const selections = plan.hotelPlans.map(stay => ({ location: stay.location, hotelId: '', hotelName: `${stay.location} Heritage Hotel`,
  accommodationType: 'hotel', category: 'Signature', starRating: 4, address: '', roomType: '', website: '', nights: stay.nights,
  rooms: 3, extraBeds: 1, cnb: 0, nightlyRate: 3000, extraBedRate: 1000, cnbRate: 0, source: 'custom', status: 'user-edited',
  ...(stay.location === 'Srinagar' ? { nights: srinagarNights.length - 1, nightNumbers: srinagarNights.slice(1) } : {}),
  alternatives: [{ hotelId: '', hotelName: `${stay.location} Riverside Grand`, nightlyRate: 4500, extraBedRate: 1200, cnbRate: 0 }],
}));
selections.push({ ...selections.find(hotel => hotel.location === 'Srinagar'), hotelName: 'Lake Heritage Houseboat',
  accommodationType: 'houseboat', alternatives: [], nights: 1, nightNumbers: srinagarNights.slice(0, 1) });
const quotes = ['Signature', 'Signature Plus', 'Signature Premium', 'Elite'].map((category, index) => {
  const scopedInput = { ...input, hotelCategory: category, transport: index === 2 ? 'Innova Crysta AC' : input.transport };
  const scopedPlan = { ...plan, input: scopedInput };
  const hotels = selections.map(hotel => ({ ...hotel, category, hotelName: `${category} ${hotel.hotelName}`, nightlyRate: hotel.nightlyRate + index * 1200,
    alternatives: hotel.alternatives.map(option => ({ ...option, hotelName: `${category} ${option.hotelName}`, nightlyRate: option.nightlyRate + index * 1200 })) }));
  const quote = { ...model, transportDaily: model.transportDaily + index * 500 };
  return { category, plan: scopedPlan, input: scopedInput, selections: hotels, quote, costs: calculateCosts(scopedPlan, hotels, quote) };
});
const dataUrl = (name, type) => `data:${type};base64,${fs.readFileSync(path.join(root, 'public', name)).toString('base64')}`;
const art = { cover: dataUrl('pdf-assets/winter/winter-cover.jpg', 'image/jpeg'),
  brandInk: dataUrl('chakar-logo-original-ink.png', 'image/png'), brandWhite: dataUrl('chakar-logo-original-white.png', 'image/png') };
const fonts = Object.fromEntries([['regular', 'Evolventa-Regular.ttf'], ['bold', 'Evolventa-Bold.ttf'], ['cover', 'RedHatDisplay-400.ttf']]
  .map(([key, name]) => [key, fs.readFileSync(path.join(root, 'public', 'fonts', name)).toString('base64')]));
const activities = { included: ['One-hour Shikara ride', 'Local guide'], excluded: ['Airfare', 'Personal expenses'] };
const normalize = value => value.replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014\u2011]/g, '-').replace(/→/g, 'to').replace(/≤/g, '<=').replace(/\s+/g, ' ').trim();
const flatten = doc => normalize(doc.drawnText.flatMap(entry => entry.lines).join(' '));
// Read flow columns without repeated page/table headers interrupting continued content.
const flowColumns = doc => {
  const columns = new Map();
  for (const entry of doc.drawnText.filter(entry => entry.y >= 160 && entry.y <= 710)) {
    const key = `${entry.font}:${entry.size}:${entry.x}:${entry.bold}`;
    columns.set(key, [...(columns.get(key) || []), ...entry.lines]);
  }
  return [...columns.values()].map(lines => normalize(lines.join(' ')));
};
function build(base, comparisons = [], lists = activities) {
  return buildWinterClientPdf(art, base.plan, base.input, base.selections, base.costs, input.name, fonts, lists, base.quote, comparisons);
}
function checkBounds(doc, name) {
  for (const entry of doc.drawnText) {
    const lineHeight = (entry.options.lineHeightFactor || 1.15) * entry.size;
    assert.ok(entry.y - entry.size >= 0 && entry.y + (entry.lines.length - 1) * lineHeight <= 762,
      `${name}: text must fit vertically on page ${entry.page}: ${entry.lines.join(' ').slice(0, 65)}`);
    for (const width of entry.widths) {
      const left = entry.options.align === 'right' ? entry.x - width : entry.options.align === 'center' ? entry.x - width / 2 : entry.x;
      assert.ok(left >= 27 && left + width <= 503, `${name}: text must stay within margins: ${entry.lines.join(' ').slice(0, 65)}`);
    }
    assert.ok(['evolventa', 'redhat'].includes(entry.font), `${name}: body and headings must use real embedded fonts.`);
    if (entry.size === 9.6) {
      const cell = doc.drawnRects.find(rect => rect.page === entry.page && rect.x === entry.x - 11 && rect.y <= entry.y - entry.size &&
        rect.y + rect.height >= entry.y + (entry.lines.length - 1) * lineHeight && rect.style === 'F');
      assert.ok(cell && entry.widths.every(width => width <= cell.width - 22 + 0.2), `${name}: table text must remain inside its own padded cell.`);
    }
  }
}
async function parse(bytes) {
  const parser = new PDFParse({ data: bytes });
  try { return normalize((await parser.getText()).text); } finally { await parser.destroy(); }
}
async function main() {
  const before = JSON.stringify({ input, plan, selections, quotes });
  const docs = [['winter-client', build(quotes[0]), [quotes[0]]],
    ['winter-two-packages', build(quotes[0], quotes.slice(0, 2)), quotes.slice(0, 2)],
    ['winter-three-packages', build(quotes[0], quotes.slice(0, 3)), quotes.slice(0, 3)],
    ['winter-four-packages', build(quotes[0], quotes), quotes]];
  const longName = 'Grand Heritage Garden Residence and Riverside Mountain View Suites '.repeat(38) + 'Complete Property Name';
  const longStory = 'Walk beside the river and enjoy the landscape at your own pace. '.repeat(95) + 'The complete final sentence must remain visible.';
  const stress = quotes.slice(0, 3).map((item, index) => ({ ...item,
    category: index === 1 ? 'Signature Plus with a spacious heritage riverside collection and mountain retreat' : item.category,
    plan: { ...item.plan, dayPlans: item.plan.dayPlans.map((day, i) => i ? day : { ...day, customAbout: longStory }) },
    selections: item.selections.map((hotel, i) => i ? hotel : { ...hotel, hotelName: longName, alternatives: [] }),
  }));
  const longInclusion = 'The package includes a guided local experience at the chosen destination. '.repeat(90) + 'Complete inclusion ending.';
  docs.push(['winter-long-content', build(stress[0], stress, { included: [longInclusion], excluded: ['Excluded item. '.repeat(120) + 'Complete exclusion ending.'] }), stress]);
  fs.mkdirSync(path.join(root, 'tmp', 'pdfs'), { recursive: true });
  for (const [name, doc, expected] of docs) {
    checkBounds(doc, name);
    assert.equal(doc.clippedRects.length, 2, 'Cover and closing landscape use independent clipping frames.');
    assert.ok(doc.clippedRects.every(rect => rect.style === null), 'A clipping rectangle must keep its unpainted path; default stroke loses the mask and lets art cover text.');
    const text = flatten(doc);
    const columns = flowColumns(doc);
    assert.equal(doc.drawnText.filter(entry => entry.lines.join(' ') === 'Booking policies').length, 1,
      'The approved policy copy and its footnote must fit together, without an almost-empty extra page.');
    for (const item of expected) {
      assert.ok(text.includes(normalize(item.category)), `${name}: every selected package must be identified.`);
      assert.ok(text.includes(`Rs. ${Math.round(item.costs.sellingTotal).toLocaleString('en-IN')}/-`), `${name}: use the existing calculated client total.`);
      assert.ok(text.includes(item.input.transport), `${name}: package-specific vehicle must survive export.`);
      for (const hotel of item.selections) {
        assert.ok(columns.some(column => column.includes(normalize(hotel.hotelName))), `${name}: no hotel names may be dropped.`);
        for (const alternative of hotel.alternatives) assert.ok(text.includes(alternative.hotelName), `${name}: retain each selected hotel alternative.`);
      }
    }
    assert.ok(text.includes('Houseboats 1 night'), `${name}: houseboat uses a separate row and actual night allocation.`);
    assert.ok(text.includes('Srinagar 2 nights'), `${name}: hotel nights exclude the houseboat night.`);
    assert.ok(text.includes('or similar'), `${name}: multiple-hotel options must keep their client label.`);
    assert.doesNotMatch(text, /B2B|profitPct|contingencyPct|b2bCost/, 'Internal costing controls must never reach a client PDF.');
    for (const section of winterStaticCopy.policies) for (const paragraph of section.paragraphs) assert.ok(columns.some(column => column.includes(normalize(paragraph))), `${name}: approved policy text must remain complete.`);
    for (const contact of winterStaticCopy.contacts) assert.ok(text.includes(contact), `${name}: retain company contacts.`);
    for (const day of expected[0].plan.dayPlans) {
      const story = accommodationDayNarrative(expected[0].plan, expected[0].selections, day, input.pickup, expected[0].quote);
      assert.ok(columns.some(column => column.includes(normalize(story))), `${name}: narrative must reuse existing accommodation and itinerary rules.`);
    }
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    fs.writeFileSync(path.join(root, 'tmp', 'pdfs', `${name}.pdf`), bytes);
    const pdf = await PDFDocument.load(bytes), images = [];
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') images.push(object);
    }
    assert.ok(images.some(image => Number(image.dict.get(PDFName.of('Width'))?.toString()) >= 1024), 'Keep the full-resolution winter landscape.');
    assert.ok(pdf.getPages().every(page => page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)?.keys().length), 'Every page must contain vector-font resources, not a screenshot of a page.');
    assert.match(pdf.getSubject(), /Winter edition v1/);
    const extracted = await parse(bytes);
    assert.match(extracted, /Winter Traveller/);
    assert.ok(extracted.includes('U79110JK2024PTC015972'));
    if (name === 'winter-long-content') {
      for (const ending of ['Complete Property Name', 'The complete final sentence must remain visible.', 'Complete inclusion ending.', 'Complete exclusion ending.']) assert.ok(text.includes(ending), `Oversized content must retain its ending: ${ending}`);
      assert.ok(doc.getNumberOfPages() > docs[2][1].getNumberOfPages() + 4, 'Oversized text must create continuation pages.');
    }
  }
  assert.equal(JSON.stringify({ input, plan, selections, quotes }), before, 'Rendering a theme must never mutate plans, selections, price models or snapshots.');
  const base = quotes[0];
  const originalArt = Object.fromEntries(['cover', 'letter', 'summary', 'daywise', 'package', 'hotels', 'inclusions', 'exclusions', 'policies', 'testimonials', 'thanks'].map(key => [key, '']));
  Object.assign(originalArt, { vectorBackgrounds: true, brandInk: art.brandInk, brandWhite: art.brandWhite });
  const options = { data: originalArt, plan: base.plan, input: base.input, selections: base.selections, costs: base.costs,
    customerName: input.name, fonts, activityLists: activities, quote: base.quote, comparison: quotes.slice(0, 3), winterCover: art.cover };
  const winterBytes = await buildThemedClientPdf(options); // No master supplied: Winter must be independent.
  assert.match((await PDFDocument.load(winterBytes)).getSubject(), /Winter edition v1/);
  await assert.rejects(() => buildThemedClientPdf({ ...options, winterCover: undefined }), /Winter artwork/);
  const masterBytes = fs.readFileSync(path.join(root, 'public', 'pdf-assets', 'client-master.pdf'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'pdf-assets', 'client-master.json'), 'utf8'));
  const originalBytes = await buildThemedClientPdf({ ...options, input: { ...input, pdfTheme: undefined }, winterCover: undefined, masterBytes, manifest });
  const originalText = await parse(originalBytes);
  assert.ok(originalText.includes('Discover Kashmir'), 'Legacy saved itineraries must still use the existing original PDF.');
  assert.ok(!originalText.includes('WINTER EDITION'), 'Original must not inherit winter presentation.');
  fs.writeFileSync(path.join(root, 'tmp', 'pdfs', 'winter-dispatch.pdf'), winterBytes);
  console.log('PASS Winter PDF: real fonts/vector text, approved copy, split houseboat and hotel alternatives, 1/2/3/4 independent packages, oversized content pagination, text bounds, unchanged data, production theme dispatcher and legacy Original fallback.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
