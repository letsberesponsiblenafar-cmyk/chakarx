/* Exercise the real client builder, native composition and React review page. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
const jspdf = require('jspdf');
const NativeJsPDF = jspdf.jsPDF;
jspdf.jsPDF = function InspectedJsPDF(options) {
  const doc = new NativeJsPDF(options);
  doc.drawnText = [];
  doc.drawnRects = [];
  const rect = doc.rect;
  doc.rect = function (x, y, width, height, style) {
    doc.drawnRects.push({ page: doc.internal.getCurrentPageInfo().pageNumber, x, y, width, height, style });
    return rect.call(this, x, y, width, height, style);
  };
  const text = doc.text;
  doc.text = function (value, x, y, ...args) {
    const lines = Array.isArray(value) ? value : [String(value)];
    doc.drawnText.push({ page: doc.internal.getCurrentPageInfo().pageNumber, lines, x, y,
      size: doc.getFontSize(), widths: lines.map((line) => doc.getTextWidth(String(line))) });
    return text.call(this, value, x, y, ...args);
  };
  return doc;
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PDFDocument } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const { createPlan } = require('../lib/itinerary.ts');
const { destinationByName } = require('../lib/data.ts');
const { sightseeingSentence } = require('../lib/narrative.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { hotelConfirmationSignature } = require('../lib/quote-readiness.ts');
const { composeVectorClientPdf } = require('../lib/pdf-composition.ts');
const provider = require('../components/PlannerProvider.tsx');
const pdf = require('../components/ClientPdf.tsx');
const { initialPackageDefaults } = require('../lib/package-defaults.ts');
const input = { name: 'Comparison Traveller', arrival: '2026-10-24', departure: '2026-10-28', pickup: 'Srinagar',
  adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature', packagePreferences: ['Signature', 'Signature Plus', 'Signature Premium'],
  hotelOptionMode: 'single', transport: 'Sedan Car AC', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
const plan = createPlan(input);
const model = { transportDaily: 2500, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {},
  activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
const quotes = input.packagePreferences.map((category, index) => {
  const scopedInput = { ...input, hotelCategory: category, packagePreferences: [category], transport: index === 2 ? 'Innova Crysta AC' : input.transport };
  const scopedPlan = { ...plan, input: scopedInput, vehicle: scopedInput.transport };
  const selections = plan.hotelPlans.map((stay) => ({ location: stay.location, hotelId: '', hotelName: `${category} ${stay.location} Heritage Hotel`,
    category, starRating: 4, address: '', roomType: '', website: '', nights: stay.nights, rooms: 1, extraBeds: 0, cnb: 0,
    nightlyRate: 2500 + 1700 * index, extraBedRate: 0, cnbRate: 0, source: 'custom', status: 'user-edited', rateConfirmed: true }));
  selections.forEach((hotel) => { hotel.confirmedSignature = hotelConfirmationSignature(scopedPlan, hotel, input.mealPlan); });
  const quote = { ...model, transportDaily: index === 2 ? 4500 : 2500 };
  return { category, plan: scopedPlan, input: scopedInput, selections, quote, costs: calculateCosts(scopedPlan, selections, quote) };
});
const art = Object.fromEntries(['cover','letter','summary','daywise','package','hotels','inclusions','exclusions','policies','testimonials','thanks'].map((key) => [key, '']));
art.vectorBackgrounds = true;
for (const [key, name] of [['brandWhite','chakar-logo-original-white.png'], ['brandInk','chakar-logo-original-ink.png']]) art[key] = `data:image/png;base64,${fs.readFileSync(path.join(root,'public',name)).toString('base64')}`;
const fonts = Object.fromEntries([['regular','Evolventa-Regular.ttf'],['bold','Evolventa-Bold.ttf'],['cover','RedHatDisplay-400.ttf']].map(([key,name]) => [key,fs.readFileSync(path.join(root,'public','fonts',name)).toString('base64')]));
function build(comparison) {
  const doc=pdf.buildClientPdf(art, plan, input, quotes[0].selections, quotes[0].costs, input.name, fonts, { included: [], excluded: [] }, model, comparison);
  doc.overlayBytes=doc.output('arraybuffer');
  return doc;
}
const fourQuotes = [...quotes, { ...quotes[2], category: 'Elite',
  input: { ...quotes[2].input, hotelCategory: 'Elite', packagePreferences: ['Elite'] },
  selections: quotes[2].selections.map((hotel) => ({ ...hotel, hotelName: `Elite ${hotel.location} Heritage Hotel`, category: 'Elite' })) }];
const docs = [['two-packages', build(quotes.slice(0,2)), quotes.slice(0,2)], ['three-packages', build(quotes), quotes],
  ['four-packages', build(fourQuotes), fourQuotes]];
const longQuotes = quotes.map((quote, index) => ({ ...quote, selections: quote.selections.map((hotel, hotelIndex) => ({ ...hotel,
  hotelName: hotelIndex === 0 && index === 1 ? `${'Grand Heritage Garden Residence and Riverside Mountain View Suites '.repeat(38)}Complete Property Name` : hotel.hotelName })) }));
const longLocation = 'Wilderness Mountain Wildlife Sanctuary and Mountain Wilderness Conservation Heritage Resort Area';
const originalLocation = plan.hotelPlans[0].location;
const longLocationQuotes = quotes.map((quote) => ({ ...quote,
  plan: { ...quote.plan,
    hotelPlans: quote.plan.hotelPlans.map((stay) => stay.location === originalLocation ? { ...stay, location: longLocation } : stay),
    dayPlans: quote.plan.dayPlans.map((day) => day.stay === originalLocation ? { ...day, stay: longLocation } : day) },
  selections: quote.selections.map((hotel) => hotel.location === originalLocation ? { ...hotel, location: longLocation, hotelName: 'Hotel A' } : hotel) }));
docs.push(['long-package-hotels', build(longQuotes), longQuotes], ['long-package-destinations', build(longLocationQuotes), longLocationQuotes]);
for (const [name, doc, expected] of docs) {
  const artPages = pdf.clientPdfArtwork(doc);
  const packagePages = artPages.flatMap((page,index) => page.comparison && page.key === 'package' ? [index+1] : []);
  const hotelPages = artPages.flatMap((page,index) => page.comparison && page.key === 'hotels0' ? [index+1] : []);
  const dayPages = artPages.flatMap((page,index) => page.key === 'daywise' ? [index+1] : []);
  const dayText = doc.drawnText.filter((entry) => dayPages.includes(entry.page)).flatMap((entry) => entry.lines).join(' ').replace(/\s+/g,' ');
  const sources = plan.dayPlans.flatMap((day) => day.blocks.flatMap((block) => block.librarySights || []));
  for (const name of new Set(sources.map((source) => source.destination))) {
    const guide = destinationByName(name);
    const selected = new Set(sources.filter((source) => source.destination === name).map((source) => source.name));
    const sentences = [...new Set(guide.local_sightseeing.filter((sight) => selected.has(sight.name)).map((sight) => sightseeingSentence(sight).replace(/\s+/g,' ')))];
    let previous = -1;
    for (const sentence of sentences) {
      const position = dayText.indexOf(sentence);
      assert.ok(position > previous, `${name}: PDF sightseeing must retain the destination library order.`);
      previous = position;
    }
  }
  assert.ok(packagePages.length && hotelPages.length, 'Multiple packages need dynamic investment and hotel comparison pages.');
  const investmentText = doc.drawnText.filter((entry) => packagePages.includes(entry.page)).flatMap((entry) => entry.lines).join(' ');
  for (const quote of expected) {
    assert.ok(investmentText.includes(quote.category));
    assert.ok(investmentText.includes(`Rs. ${Math.round(quote.costs.sellingTotal).toLocaleString('en-IN')}/-`), 'Every package needs its own calculated selling total.');
    assert.ok(investmentText.includes(quote.input.transport), 'Optional package vehicles must reach the client comparison.');
  }
  assert.ok(!investmentText.includes(`Rs. ${Math.round(expected.reduce((sum,quote) => sum+quote.costs.sellingTotal,0)).toLocaleString('en-IN')}/-`), 'Alternative packages must never be added into one client total.');
  const hotelText = doc.drawnText.filter((entry) => hotelPages.includes(entry.page) && entry.y < 750);
  expected.forEach((quote) => {
    const headings = hotelText.filter((entry) => entry.size === 10.5 && entry.lines.join(' ') === quote.category);
    assert.ok(headings.length, `${name}: Every category must retain its own hotel-comparison column.`);
    const flattened=hotelText.filter((entry)=>entry.size===9.6 && headings.some((heading) => entry.page === heading.page && entry.x === heading.x)).flatMap((entry)=>entry.lines).join(' ').replace(/\s+/g,' ');
    for (const hotel of quote.selections) assert.ok(flattened.includes(hotel.hotelName.replace(/\s+/g,' ').trim()), `${name}: Every property name must be retained in full.`);
  });
  for (const entry of hotelText) {
    assert.ok(entry.y >= 190 && entry.y + (entry.lines.length-1)*entry.size*1.2 <= 727, `${name}: Comparison text must remain above the footer.`);
    const columnCount = hotelText.filter((header) => header.page === entry.page && header.size === 10.5 && header.lines.join(' ') !== 'Destination').length;
    const maxWidth = entry.x === 96 ? 104 : (540-70-122)/columnCount-15;
    assert.ok(entry.widths.every((width) => width <= maxWidth+1), `${name}: Comparison text must fit its column.`);
    if (entry.x === 96 && entry.size === 10) {
      const center = entry.y + (entry.lines.length-1)*12/2 - 3;
      const row = doc.drawnRects.find((rect) => rect.page === entry.page && rect.x === 35 && rect.width === 122 && !rect.style && Math.abs(rect.y+rect.height/2-center) < 0.01);
      assert.ok(row, `${name}: Each destination label must belong to a table row.`);
      assert.ok(entry.y-entry.size*0.8 >= row.y+8 && entry.y+(entry.lines.length-1)*12 <= row.y+row.height-8,
        `${name}: Destination text and nights must stay inside their row with padding.`);
    }
  }
  if (name === 'long-package-hotels') {
    assert.ok(hotelPages.length > 1, 'Long names must continue on another hotel page.');
    assert.ok(hotelText.some((entry) => entry.lines.includes('Continued')));
  }
}
// Render the actual review component with the same scoped planner data used
// for a download. This catches a primary-only preview or incomplete lock.
const fixture = { input, plan, hotelSelections: quotes[0].selections, costModel: model, hotelDatabase: [], hotelDefaults: {},
  routeVersion: null, generated: true, savedItineraryId: null, packageQuotes: Object.fromEntries(quotes.slice(1).map((quote) => [quote.category,
    { hotelSelections: quote.selections, transport: quote.input.transport, costOverrides: { transportDaily: quote.quote.transportDaily } }])),
  destinationCatalog: [], destinationConnection: 'ready', hotelConnection: 'ready', packageDefaults: initialPackageDefaults(),
  packageDefaultsConnection: 'ready', hydrated: true, markSavedItinerary() {}, reset() {} };
provider.usePlanner = () => fixture;
let markup = renderToStaticMarkup(React.createElement(pdf.default));
for (const quote of quotes) {
  assert.ok(markup.includes(`data-package-quote="${quote.category}"`), 'The review must include every selected package.');
  assert.ok(markup.includes(`₹${Math.round(quote.costs.sellingTotal).toLocaleString('en-IN')}`), 'Preview and download must use the same total.');
}
fixture.packageQuotes['Signature Plus'].hotelSelections[0].rateConfirmed = false;
markup = renderToStaticMarkup(React.createElement(pdf.default));
assert.match(markup, /Signature Plus.*Verify/s, 'An incomplete secondary package must lock the complete client download.');
assert.match(markup, /disabled=""[^>]*>.*Download client PDF/s);
async function main() {
  const master = fs.readFileSync(path.join(root,'public','pdf-assets','client-master.pdf'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'public','pdf-assets','client-master.json'),'utf8'));
  fs.mkdirSync(path.join(root,'tmp','pdfs'), { recursive: true });
  for (const [name, doc] of docs) {
    const overlay=doc.overlayBytes;
    fs.writeFileSync(path.join(root,'tmp','pdfs',`${name}-overlay.pdf`), Buffer.from(overlay));
    const bytes = await composeVectorClientPdf(overlay, master, pdf.clientPdfArtwork(doc), manifest);
    fs.writeFileSync(path.join(root,'tmp','pdfs',`${name}.pdf`), bytes);
    const parsed = await PDFDocument.load(bytes);
    assert.equal(parsed.getPageCount(), doc.getNumberOfPages());
    const parser = new PDFParse({ data: bytes });
    let extracted;
    try { extracted = (await parser.getText()).text; } finally { await parser.destroy(); }
    assert.match(extracted, /Signature Plus/);
    assert.doesNotMatch(extracted, /Dear Asna|Hotel Star of Kashmir|PROVISIONAL/);
  }
  console.log('PASS multi-package client PDF: 2/3/4 independent investments, scoped hotels/vehicles, complete long-name pagination, padded destination rows, native artwork, real review preview and readiness lock.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
