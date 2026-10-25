const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
const originalLoad = Module._load;
const hooks = []; let hookIndex = 0;
Module._load = function(request, parent, isMain) {
  if (request === 'react') return { ...React,
    useState(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
    useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useEffect() {}, useMemo: callback => callback() };
  return originalLoad.call(this, request, parent, isMain);
};
Module._resolveFilename = function(request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};
require.extensions['.css'] = () => {};
const { pdfThemes, resolvePdfTheme } = require('../lib/pdf-themes.ts');
const { validatedTripInput } = require('../lib/itinerary.ts');
const { generatePlannerState, setPdfThemeInState, applyPdfDesignInState, itinerarySnapshot, restoreSavedItinerary, PlannerProvider } = require('../components/PlannerProvider.tsx');
const { defaultPdfDesign, effectivePdfDesign } = require('../lib/pdf-designs.ts');
const { hotelDatabase } = require('../lib/data.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { hotelConfirmationSignature, planInputsNeedRefresh, quoteReadiness } = require('../lib/quote-readiness.ts');
const PdfThemePicker = require('../components/PdfThemePicker.tsx').default;
const input = { name: 'Theme preservation', arrival: '2026-12-14', departure: '2026-12-17', arrivalTime: '09:00', departureTime: '19:00',
  pickup: 'Srinagar', adults: 2, youngAges: [], budget: 60000, hotelCategory: 'Signature', packagePreferences: ['Signature', 'Signature Plus'],
  transport: 'Ertiga', mealPlan: 'Breakfast & Dinner', hotelOptionMode: 'single', style: 'Balanced', interests: ['Nature'] };
const state = generatePlannerState({ input, plan: null, routeVersion: null, hotelSelections: [], hotelDatabase,
  costModel: { transportDaily: 4200, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0,
    activityCosts: {}, activitySelections: {}, manualInclusions: ['Client welcome'], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 },
  hotelDefaults: { rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }, generated: false, savedItineraryId: null });
state.hotelSelections = state.hotelSelections.map(hotel => {
  const selected = { ...hotel, hotelName: 'Agreed client hotel', source: 'Custom hotel', nightlyRate: 3450, rateConfirmed: true };
  return { ...selected, confirmedSignature: hotelConfirmationSignature(state.plan, selected, state.plan.input.mealPlan) };
});
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function test(label, run) { run(); checks++; console.log(`PASS ${label}`); }
test('exactly Original and Winter are published; legacy and unknown themes use Original', () => {
  assert.deepEqual(pdfThemes.map(theme => theme.id), ['original', 'winter']);
  for (const theme of pdfThemes) {
    assert.ok(fs.existsSync(path.join(root, 'public', theme.preview)), `${theme.name} preview must be shipped`);
    assert.ok(fs.existsSync(path.join(root, 'public', theme.coverArtwork)), `${theme.name} artwork must be shipped`);
  }
  assert.notEqual(resolvePdfTheme('winter').preview, resolvePdfTheme('winter').coverArtwork, 'Export must use full-resolution artwork, not the sample cover thumbnail');
  assert.equal(resolvePdfTheme().id, 'original');
  assert.equal(resolvePdfTheme('unsupported').id, 'original');
  assert.equal(validatedTripInput(input).pdfTheme, 'original');
  assert.equal(validatedTripInput({ ...input, pdfTheme: 'winter' }).pdfTheme, 'winter');
  assert.equal(validatedTripInput({ ...input, pdfTheme: 'unsupported' }).pdfTheme, 'original');
});
test('changing a theme retains the exact route, selected hotels, confirmations and package prices', () => {
  const before = clone(state);
  const winter = setPdfThemeInState(state, 'winter');
  assert.equal(winter.input.pdfTheme, 'winter');
  for (const field of ['plan', 'hotelSelections', 'packageQuotes', 'costModel', 'hotelDefaults', 'hotelDatabase']) {
    assert.equal(winter[field], state[field], `${field} changed when selecting a PDF design`);
  }
  assert.deepEqual(clone(state), before, 'Selecting a design mutated the previous trip');
  assert.deepEqual(calculateCosts(winter.plan, winter.hotelSelections, winter.costModel), calculateCosts(state.plan, state.hotelSelections, state.costModel));
  assert.equal(planInputsNeedRefresh(winter.plan, winter.input), false);
  assert.deepEqual(quoteReadiness(winter.plan, winter.input, winter.hotelSelections, winter.costModel, hotelDatabase, 'ready', 'ready'),
    quoteReadiness(state.plan, state.input, state.hotelSelections, state.costModel, hotelDatabase, 'ready', 'ready'));
  assert.equal(setPdfThemeInState(winter, 'winter'), winter, 'Reselecting the current design should do nothing');
});
test('theme survives draft serialization and saved itinerary reopening without refreshing reference data', () => {
  const winter = setPdfThemeInState(state, 'winter');
  assert.equal(clone(winter).input.pdfTheme, 'winter');
  const snapshot = clone(itinerarySnapshot(winter));
  const restored = restoreSavedItinerary(state, 'saved-winter', snapshot);
  assert.equal(restored.input.pdfTheme, 'winter');
  assert.equal(restored.plan.referenceMode, 'saved');
  assert.deepEqual(restored.plan.dayPlans, clone(winter.plan.dayPlans));
  assert.deepEqual(restored.plan.destinationSnapshot, snapshot.plan.destinationSnapshot);
  const changed = setPdfThemeInState(restored, 'original');
  assert.equal(changed.plan, restored.plan);
  assert.equal(changed.savedItineraryId, 'saved-winter');
  assert.deepEqual(changed.hotelSelections, restored.hotelSelections);
});
test('opening a legacy snapshot after a Winter trip selects Original', () => {
  const legacy = clone(itinerarySnapshot(state));
  delete legacy.input.pdfTheme;
  delete legacy.plan.input.pdfTheme;
  const restored = restoreSavedItinerary(setPdfThemeInState(state, 'winter'), 'legacy', legacy);
  assert.equal(resolvePdfTheme(restored.input.pdfTheme).id, 'original');
  assert.deepEqual(restored.plan.dayPlans, legacy.plan.dayPlans);
});

test('custom colours and immutable image references stay with a saved trip until explicitly applied', () => {
  const custom = defaultPdfDesign('winter');
  custom.colors.accent = '#A0C4D4';
  custom.images.coverMain = '/api/pdf-design-assets/' + 'a'.repeat(64);
  const applied = applyPdfDesignInState(state, custom);
  const snapshot = clone(itinerarySnapshot(applied));
  const changedLibraryDesign = { ...custom, colors: { ...custom.colors, accent: '#B2CCDA' } };
  const restored = restoreSavedItinerary(applyPdfDesignInState(state, changedLibraryDesign), 'frozen-design', snapshot);
  assert.deepEqual(effectivePdfDesign(restored.input), custom);
  assert.deepEqual(validatedTripInput(restored.input).pdfDesign, custom);
  assert.deepEqual(clone(restored).input.pdfDesign, custom);
  const updated = applyPdfDesignInState(restored, changedLibraryDesign);
  assert.deepEqual(effectivePdfDesign(updated.input), changedLibraryDesign);
  assert.deepEqual(effectivePdfDesign(restored.input), custom, 'Applying changes must not mutate the saved baseline');
  for (const field of ['plan', 'hotelSelections', 'packageQuotes', 'costModel', 'savedItineraryId']) assert.equal(updated[field], restored[field]);
});
test('building the same itinerary in either theme produces the same trip and quote', () => {
  const original = generatePlannerState(state, { pdfTheme: 'original' });
  const winter = generatePlannerState(state, { pdfTheme: 'winter' });
  const withoutTheme = value => { const copy = clone(value); delete copy.input.pdfTheme; delete copy.plan.input.pdfTheme; return copy; };
  assert.deepEqual(withoutTheme(winter), withoutTheme(original));
});
test('provider theme selection survives itinerary day removal and keeps the saved trip identity', () => {
  function render() { hookIndex = 0; return PlannerProvider({ children: null }).props.value; }
  render().loadSavedItinerary('selected-trip', clone(itinerarySnapshot(state)));
  render().setInputField('pdfTheme', 'winter');
  const selected = render();
  assert.equal(selected.input.pdfTheme, 'winter');
  selected.removeDay(2);
  const shortened = render();
  assert.equal(shortened.plan.nights, state.plan.nights - 1);
  assert.equal(shortened.input.pdfTheme, 'winter');
  assert.equal(shortened.savedItineraryId, 'selected-trip');
});
test('selector renders two labelled native radio choices and marks only the selected design', () => {
  const markup = renderToStaticMarkup(React.createElement(PdfThemePicker, { value: 'winter', onChange() {} }));
  assert.equal((markup.match(/type="radio"/g) || []).length, 2);
  assert.equal((markup.match(/checked=""/g) || []).length, 1);
  assert.match(markup, /checked="" value="winter"/);
  assert.match(markup, /aria-label="PDF theme"/);
  assert.ok(markup.includes('Original') && markup.includes('Winter'));
});
console.log(`${checks} PDF theme checks passed.`);
