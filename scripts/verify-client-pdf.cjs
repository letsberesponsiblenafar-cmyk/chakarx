/* Render a representative client PDF through the same builder used by the UI. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
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

// Record the text actually sent to jsPDF. Embedded custom fonts use glyph IDs
// in the PDF stream, so searching its bytes would miss accidental client copy.
const jspdf = require('jspdf');
const NativeJsPDF = jspdf.jsPDF;
jspdf.jsPDF = function InspectedJsPDF(options) {
  const doc = new NativeJsPDF(options);
  doc.clientText = [];
  const text = doc.text;
  doc.text = function (value, x, y, ...args) {
    doc.clientText.push({
      page: doc.internal.getCurrentPageInfo().pageNumber,
      text: Array.isArray(value) ? value.flat(Infinity).join('\n') : String(value),
      x, y, font: doc.getFont().fontName, size: doc.getFontSize(),
    });
    return text.call(this, value, x, y, ...args);
  };
  return doc;
};

const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip, setPlanDeparturePoint } = require('../lib/itinerary.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { clientActivityLists } = require('../lib/activities.ts');
const { buildClientPdf, clientPdfArtwork } = require('../components/ClientPdf.tsx');
const { composeVectorClientPdf } = require('../lib/pdf-composition.ts');
const { initialPackageDefaults } = require('../lib/package-defaults.ts');
const { PDFDocument, PDFDict, PDFName, PDFRawStream } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const input = {
  name: 'QA Traveller', arrival: '2026-10-03', departure: '2026-10-10', pickup: 'Srinagar',
  adults: 6, youngAges: [7], budget: 0, hotelCategory: 'Signature', transport: 'Tempo Traveller',
  mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature','Photography','Relaxation'],
};
const sequence = ['Srinagar','Pahalgam','Srinagar','Pahalgam','Pahalgam','Srinagar','Gulmarg'];
const plan = rebuildPlanFromNightSequence(createPlan(input), sequence);
const dayTripPlan = setPlanDayTrip(rebuildPlanFromNightSequence(createPlan(input), ['Srinagar','Srinagar','Srinagar','Pahalgam','Pahalgam','Srinagar','Sonamarg']), 2, 'Sonamarg');
if (dayTripPlan.dayPlans[1].dayTripDestination !== 'Sonamarg' || dayTripPlan.dayPlans[1].stay !== 'Srinagar' || dayTripPlan.dayPlans[2].from !== 'Srinagar') throw new Error('A Sonamarg day visit changed the Srinagar overnight or following origin.');
if (dayTripPlan.dayPlans.at(-1).from !== 'Sonamarg' || dayTripPlan.dayPlans.at(-1).to !== 'Srinagar') throw new Error('Departure transfer should start at the final hotel and default to Srinagar.');
const changedDeparture = setPlanDeparturePoint(dayTripPlan, 'Sonamarg');
if (changedDeparture.dayPlans.at(-1).to !== 'Sonamarg' || rebuildPlanFromNightSequence(changedDeparture, ['Srinagar','Srinagar','Srinagar','Pahalgam','Pahalgam','Srinagar','Sonamarg']).dayPlans.at(-1).to !== 'Sonamarg') throw new Error('Edited departure point did not persist.');
const selections = plan.hotelPlans.map((row) => ({
  location: row.location, hotelId: '', hotelName: `${row.location} Sample Hotel`, category: 'Signature',
  starRating: 3, address: '', roomType: '', website: '', nights: row.nights,
  rooms: 3, extraBeds: 1, cnb: 0, nightlyRate: 3000, extraBedRate: 1000, cnbRate: 0,
  source: 'PDF verification', status: 'rate entered',
}));
const costs = calculateCosts(plan, selections, { transportDaily: 8000, otherAmount: 0, profitPct: 10 });
const artFiles = {
  cover: 'branded-cover.png', letter: 'branded-letter.jpg', summary: 'branded-summary.jpg',
  daywise: 'standard-daywise.jpg', package: 'branded-package.jpg', hotels: 'branded-hotels.jpg',
  inclusions: 'client-inclusions.jpg', exclusions: 'client-exclusions.jpg', policies: 'branded-policies.jpg',
  testimonials: 'branded-testimonials.jpg', thanks: 'standard-thanks.jpg',
};
// The production download composes native PDF pages. Supplying no bitmap
// backgrounds also proves its quality does not depend on raster fallbacks.
const art = Object.fromEntries(Object.keys(artFiles).map((key) => [key, '']));
art.vectorBackgrounds = true;
art.brandWhite = `data:image/png;base64,${fs.readFileSync(path.join(root, 'public', 'chakar-logo-original-white.png')).toString('base64')}`;
art.brandInk = `data:image/png;base64,${fs.readFileSync(path.join(root, 'public', 'chakar-logo-original-ink.png')).toString('base64')}`;
const fonts = {
  regular: fs.readFileSync(path.join(root, 'public', 'fonts', 'Evolventa-Regular.ttf')).toString('base64'),
  bold: fs.readFileSync(path.join(root, 'public', 'fonts', 'Evolventa-Bold.ttf')).toString('base64'),
  cover: fs.readFileSync(path.join(root, 'public', 'fonts', 'RedHatDisplay-400.ttf')).toString('base64'),
};
const activityLists = clientActivityLists(plan, {}, {}, [], [], undefined, initialPackageDefaults());
const doc = buildClientPdf(art, plan, input, selections, costs, input.name, fonts, activityLists);
const emptyLists = buildClientPdf(art, plan, input, selections, costs, input.name, fonts, { included: [], excluded: [] });
const withExclusion = buildClientPdf(art, plan, input, selections, costs, input.name, fonts, { included: [], excluded: ['Airfare'] });
assert.equal(withExclusion.getNumberOfPages(), emptyLists.getNumberOfPages() + 1,
  'An empty exclusion list must omit its page; an explicit exclusion must add it.');
assert.ok(doc.clientText.some((entry) => entry.text === `${plan.nights} Nights / ${plan.days} Days`),
  'Removing hotel night labels must keep the tour duration in its summary.');
assert.ok(doc.clientText.some((entry) => entry.text === `${plan.nights}N/${plan.days}D Trip Investments`),
  'The package investment section must retain its trip duration.');

const hotelPages = doc.clientText.filter((entry) => entry.text === 'Destination').map((entry) => entry.page);
assert.ok(hotelPages.length > 0, 'The hotel table needs its destination column.');
for (const page of hotelPages) {
  const entries = doc.clientText.filter((entry) => entry.page === page);
  assert.ok(entries.some((entry) => entry.text === 'Hotel'), 'The second hotel-table column must name the hotel.');
  assert.ok(!entries.some((entry) => /^Nights\s+\d|\s\d+N$/.test(entry.text)),
    'Hotel rows must show only the destination and hotel name, without night counts or numbers.');
}
for (const hotel of selections) {
  assert.ok(doc.clientText.some((entry) => hotelPages.includes(entry.page) && entry.text === hotel.location),
    `${hotel.location} must remain visible in the hotel table.`);
  assert.ok(doc.clientText.some((entry) => hotelPages.includes(entry.page) && entry.text === hotel.hotelName),
    `${hotel.hotelName} must remain visible in the hotel table.`);
}

const normalize = (value) => value.replace(/\s+/g, ' ').trim().replace(/[.!?]$/, '').toLowerCase();
for (const [key, heading] of [['inclusions', 'YOUR PACKAGE INCLUDES'], ['exclusions', 'NOT INCLUDED IN THIS PACKAGE']]) {
  const listPages = doc.clientText.filter((entry) => entry.text === heading).map((entry) => entry.page);
  const expected = activityLists[key === 'inclusions' ? 'included' : 'excluded'];
  for (const item of expected) {
    assert.ok(doc.clientText.some((entry) => listPages.includes(entry.page) && normalize(entry.text) === normalize(item)),
      `A configured ${key} clause did not reach the client PDF: ${item}`);
  }
  for (const page of listPages) {
    const body = doc.clientText.filter((entry) => entry.page === page && entry.x === 58 && entry.y >= 158);
    const unique = new Set(body.map((entry) => normalize(entry.text)));
    assert.equal(unique.size, body.length, 'The package list must not repeat the same clause.');
    assert.ok(body.every((entry) => entry.font === 'evolventa' && entry.size >= 11),
      'Package clauses must retain the reference font and readable text size.');
    assert.ok(body.every((entry) => entry.y <= 696), 'Package text must stay above the footer.');
  }
}

function nativeObjects(pdf) {
  const objects = pdf.context.enumerateIndirectObjects().map(([, object]) => object);
  const imageStreams = objects.filter((object) => object instanceof PDFRawStream &&
    object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
  const fontNames = objects.filter((object) => object instanceof PDFDict &&
    object.get(PDFName.of('Type'))?.toString() === '/Font')
    .map((object) => object.get(PDFName.of('BaseFont'))?.toString() || '');
  return {
    imageStreams, fontNames,
    patterns: objects.filter((object) => object instanceof PDFDict && object.has(PDFName.of('PatternType'))).length,
    fullPageBitmaps: imageStreams.filter((object) =>
      object.dict.lookup(PDFName.of('Width')).asNumber() >= 2250 &&
      object.dict.lookup(PDFName.of('Height')).asNumber() >= 3250).length,
  };
}

async function verifyFinalPdf() {
  const directory = path.join(root, 'public', 'pdf-assets');
  const masterBytes = new Uint8Array(fs.readFileSync(path.join(directory, 'client-master.pdf')));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'client-master.json'), 'utf8'));
  const artwork = clientPdfArtwork(doc);
  assert.equal(artwork.length, doc.getNumberOfPages(), 'Every content page must have native artwork.');
  assert.ok(artwork.some(({ key }) => key === `hotels${selections.length}`),
    'The native hotel table must select only the occupied rows.');
  const overlayBytes = doc.output('arraybuffer');
  await assert.rejects(composeVectorClientPdf(overlayBytes, masterBytes, artwork.slice(1), manifest),
    /does not match its content pages/, 'A missing artwork page must fail instead of shifting later backgrounds.');
  const missingCover = { ...manifest }; delete missingCover.cover;
  await assert.rejects(composeVectorClientPdf(overlayBytes, masterBytes, artwork, missingCover),
    /artwork is missing: cover/, 'Missing native artwork must stop the download.');
  const bytes = await composeVectorClientPdf(overlayBytes, masterBytes, artwork, manifest);
  const target = path.join(os.tmpdir(), 'chakar-client-pdf-check.pdf');
  fs.writeFileSync(target, Buffer.from(bytes));
  const final = await PDFDocument.load(bytes);
  const master = await PDFDocument.load(masterBytes);
  assert.equal(final.getPageCount(), doc.getNumberOfPages(), 'Composition changed the itinerary page count.');
  for (const page of final.getPages()) assert.deepEqual(page.getSize(), { width: 540, height: 780 });
  const quality = nativeObjects(final);
  const original = nativeObjects(master);
  assert.equal(quality.fullPageBitmaps, 0, 'Native reference artwork must not be flattened into page-sized images.');
  assert.ok(quality.fontNames.some((name) => /TheSeasons/.test(name)),
    'Reference heading fonts must remain native PDF fonts.');
  assert.ok(quality.patterns > 0, 'Reference table gradients must remain vector patterns.');
  const imageHash = (image) => createHash('sha256').update(image.contents).digest('hex');
  const finalImageHashes = new Set(quality.imageStreams.map(imageHash));
  for (const [width, height] of [[640, 464], [994, 663]]) {
    const photos = original.imageStreams.filter((image) =>
      image.dict.lookup(PDFName.of('Width')).asNumber() === width &&
      image.dict.lookup(PDFName.of('Height')).asNumber() === height);
    assert.ok(photos.length, 'The reference landscape must remain in the native master.');
    assert.ok(photos.some((image) => finalImageHashes.has(imageHash(image))),
      'Original landscape bytes must be preserved without JPEG re-encoding.');
  }
  const parser = new PDFParse({ data: bytes });
  let text;
  try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  assert.match(text, /Dear QA Traveller/);
  assert.match(text, /1,54,770/);
  assert.match(text, /List of Inclusions/);
  assert.match(text, /List of Exclusions/);
  const stale = /Dear Asna|24 sep 2026|10 Nights\s*\/\s*11 Days|Hotel Star of Kashmir|PROVISIONAL|Please note that these rates/i;
  assert.doesNotMatch(text, stale,
    `Mutable sample copy must not leak from the native master: ${text.match(stale)?.[0] || ''}`);
  // October 4 is legitimately Day 2 of this QA trip. Check that sample date
  // in the cleaned master rather than banning it from the final itinerary.
  const masterParser = new PDFParse({ data: masterBytes });
  let masterText;
  try { masterText = (await masterParser.getText()).text; } finally { await masterParser.destroy(); }
  assert.doesNotMatch(masterText, /Dear Asna|24 sep 2026|04 oct 2026|10 Nights\s*\/\s*11 Days|PROVISIONAL|Please note that these rates/i,
    'The native master must not retain mutable client values.');
  for (const hotel of selections) assert.ok(text.includes(hotel.hotelName), 'Hotel names must remain searchable after composition.');
  if (final.getPageCount() < 10 || costs.sellingTotal <= 0) throw new Error('Client PDF is incomplete.');
  process.stdout.write(JSON.stringify({ target, pages: final.getPageCount(), bytes: bytes.byteLength, customerTotal: Math.round(costs.sellingTotal),
    nativeHeadingFonts: quality.fontNames.filter((name) => /TheSeasons/.test(name)).length,
    vectorPatterns: quality.patterns, fullPageBitmaps: quality.fullPageBitmaps }) + '\n');
}
verifyFinalPdf().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
