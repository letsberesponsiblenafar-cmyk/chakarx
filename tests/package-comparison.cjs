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
const { createPlan, validatedTripInput } = require('../lib/itinerary.ts');
const { syncHotelSelections, syncPackageQuotes, updatePackageInState, generatePlannerState, reconcilePlannerState, itinerarySnapshot, setSrinagarHouseboatNights } = require('../components/PlannerProvider.tsx');
const { packageCategories, packageView, validPackageQuotes } = require('../lib/package-quotes.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { packageQuoteReadiness, hotelConfirmationSignature } = require('../lib/quote-readiness.ts');
const { hotelSelectionKey, hotelStayType } = require('../lib/accommodation.ts');

const categories = ['Signature', 'Signature Plus', 'Signature Premium'];
const input = { name: 'Package comparison QA', arrival: '2026-11-01', departure: '2026-11-06',
  arrivalTime: '08:00', departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 60000,
  hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'], hotelOptionMode: 'single', packagePreferences: categories };
const db = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri'].flatMap((destination) => categories.flatMap((category, i) => ['hotel', ...(destination === 'Srinagar' ? ['houseboat'] : [])].map((type) => ({
  id: `${destination}-${category}-${type}`, destination, name: `${destination} ${category} ${type}`, normalizedCategory: category,
  sourceCategory: category, mapB2B: 2000 + i * 1500, extraBedB2B: 500, cnbB2B: 0, starRating: 3 + i,
  address: '', roomType: type === 'houseboat' ? 'Houseboat' : 'Deluxe', website: '', sourceType: 'Supplier',
  rateValidity: '', availabilityStatus: 'Available', lastUpdated: '2026-10-18', sourceFiles: [], notes: '',
}))));
function fixture(preferences = categories) {
  const brief = { ...input, packagePreferences: preferences, hotelCategory: preferences[0] };
  const plan = createPlan(brief);
  return syncPackageQuotes({ input: brief, plan, routeVersion: 'fixture', hotelDatabase: db,
    hotelSelections: syncHotelSelections(plan, [], db, brief), costModel: { transportDaily: 4321, transportIsCustom: true,
      mealPerPersonNight: 0, activityBudget: 0, activityCosts: {}, activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 123 },
    hotelDefaults: { rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }, generated: true, savedItineraryId: 'fixture' });
}
let passed = 0;
function check(name, test) { test(); passed++; console.log('PASS ' + name); }
const total = (state, category) => { const view = packageView(state, category); return calculateCosts(view.plan, view.hotelSelections, view.costModel); };
check('legacy quotes remain one package with the same price', () => {
  const state = fixture(['Signature']); delete state.input.packagePreferences; delete state.plan.input.packagePreferences;
  assert.deepEqual(packageCategories(state.input), ['Signature']);
  assert.equal(total(state, 'Signature').sellingTotal, calculateCosts(state.plan, state.hotelSelections, state.costModel).sellingTotal);
});
check('invalid or duplicate preferences are rejected', () => {
  for (const preferences of [[], ['Unknown'], ['Signature', 'Signature']]) assert.throws(() => validatedTripInput({ ...input, packagePreferences: preferences }));
});
check('each package suggests its own matching hotels and independent totals', () => {
  const state = fixture();
  categories.forEach((category) => assert.ok(packageView(state, category).hotelSelections.every((hotel) => hotel.hotelName.includes(category))));
  const amounts = categories.map((category) => total(state, category).sellingTotal);
  assert.ok(amounts[0] < amounts[1] && amounts[1] < amounts[2]);
  assert.notStrictEqual(packageView(state, categories[0]).hotelSelections, packageView(state, categories[1]).hotelSelections);
});
check('hotel edits and margin edits affect only the addressed package', () => {
  const before = fixture();
  const changed = updatePackageInState(before, 'Signature Plus', (state) => ({ ...state,
    hotelSelections: state.hotelSelections.map((hotel, i) => i ? hotel : { ...hotel, nightlyRate: 8123 }),
    costModel: { ...state.costModel, profitPct: 24, otherAmount: 678 } }));
  assert.equal(total(changed, 'Signature').sellingTotal, total(before, 'Signature').sellingTotal);
  assert.equal(total(changed, 'Signature Premium').sellingTotal, total(before, 'Signature Premium').sellingTotal);
  assert.ok(total(changed, 'Signature Plus').sellingTotal > total(before, 'Signature Plus').sellingTotal);
  assert.equal(before.packageQuotes['Signature Plus'].hotelSelections[0].nightlyRate, 3500);
});
check('no optional vehicles means every package inherits the negotiated default', () => {
  const state = fixture();
  for (const category of categories) assert.equal(packageView(state, category).costModel.transportDaily, 4321);
  state.costModel = { ...state.costModel, transportDaily: 5678 }; state.input = { ...state.input, transport: 'Custom default' };
  for (const category of categories) {
    assert.equal(packageView(state, category).costModel.transportDaily, 5678);
    assert.equal(packageView(state, category).input.transport, 'Custom default');
  }
});
check('an explicit extra vehicle changes only its package quote', () => {
  const state = fixture();
  const changed = updatePackageInState(state, 'Signature Premium', (view) => ({ ...view,
    input: { ...view.input, transport: 'Custom premium van' }, costModel: { ...view.costModel, transportDaily: 6789, transportIsCustom: true } }));
  assert.equal(packageView(changed, 'Signature Premium').input.transport, 'Custom premium van');
  assert.equal(packageView(changed, 'Signature Premium').costModel.transportDaily, 6789);
  assert.equal(packageView(changed, 'Signature Plus').costModel.transportDaily, 4321);
  assert.equal(packageView(changed, 'Signature').input.transport, 'Sedan');
});
check('shared houseboat nights propagate without copying supplier rates', () => {
  const state = fixture(); const day = state.plan.dayPlans.slice(0, state.plan.nights).find((day) => day.stay === 'Srinagar');
  assert.ok(day);
  const changed = setSrinagarHouseboatNights(state, [day.day]);
  categories.forEach((category, i) => {
    const boats = packageView(changed, category).hotelSelections.filter((hotel) => hotelStayType(hotel) === 'houseboat');
    assert.equal(boats.length, 1); assert.deepEqual(boats[0].nightNumbers, [day.day]);
    assert.equal(boats[0].nightlyRate, 2000 + i * 1500);
  });
});
check('duration changes and master refresh retain independently negotiated hotel rates', () => {
  let state = fixture();
  state = updatePackageInState(state, 'Signature Plus', (view) => ({ ...view,
    hotelSelections: view.hotelSelections.map((hotel) => ({ ...hotel, nightlyRate: 7654, status: 'user-edited' })) }));
  const changed = generatePlannerState(state, { departure: '2026-11-07' });
  assert.ok(packageView(changed, 'Signature Plus').hotelSelections.filter((hotel) => state.packageQuotes['Signature Plus'].hotelSelections.some((old) => old.location === hotel.location)).every((hotel) => hotel.nightlyRate === 7654));
  const restored = reconcilePlannerState({ ...changed, hotelDatabase: db.map((hotel) => ({ ...hotel, mapB2B: 99999 })) });
  assert.deepEqual(restored.packageQuotes['Signature Plus'].hotelSelections.map((hotel) => hotel.nightlyRate), changed.packageQuotes['Signature Plus'].hotelSelections.map((hotel) => hotel.nightlyRate));
});
check('promoting an existing package retains its hotels, total and optional vehicle', () => {
  let state = fixture();
  state = updatePackageInState(state, 'Signature Plus', (view) => ({ ...view, input: { ...view.input, transport: 'Private Innova' },
    costModel: { ...view.costModel, transportDaily: 7500, profitPct: 18 } }));
  const expected = total(state, 'Signature Plus').sellingTotal;
  const otherExpected = total(state, 'Signature Premium').sellingTotal;
  const promoted = generatePlannerState(state, { packagePreferences: ['Signature Plus', 'Signature Premium'], hotelCategory: 'Signature Plus' });
  assert.equal(promoted.input.transport, 'Private Innova');
  assert.equal(total(promoted, 'Signature Plus').sellingTotal, expected);
  assert.ok(promoted.hotelSelections.every((hotel) => hotel.hotelName.includes('Signature Plus')));
  assert.equal(total(promoted, 'Signature Premium').sellingTotal, otherExpected);
  assert.equal(packageView(promoted, 'Signature Premium').input.transport, 'Sedan');
});
check('reordering packages with the same default keeps vehicle inheritance', () => {
  const promoted = generatePlannerState(fixture(), { packagePreferences: ['Signature Plus', 'Signature Premium'], hotelCategory: 'Signature Plus' });
  assert.equal(promoted.packageQuotes['Signature Premium'].transport, undefined);
  const changed = { ...promoted, input: { ...promoted.input, transport: 'Ertiga' },
    costModel: { ...promoted.costModel, transportDaily: 5678, transportIsCustom: true } };
  for (const category of ['Signature Plus', 'Signature Premium']) {
    assert.equal(packageView(changed, category).input.transport, 'Ertiga');
    assert.equal(packageView(changed, category).costModel.transportDaily, 5678);
  }
  const restored = generatePlannerState(changed, { packagePreferences: categories, hotelCategory: 'Signature' });
  for (const category of categories) {
    assert.equal(packageView(restored, category).input.transport, 'Ertiga');
    assert.equal(packageView(restored, category).costModel.transportDaily, 5678);
  }
});
check('a legacy single-category change preserves the existing supplier agreement', () => {
  let state = fixture(['Signature']);
  delete state.input.packagePreferences; delete state.plan.input.packagePreferences;
  state.hotelSelections = state.hotelSelections.map((hotel) => ({ ...hotel, hotelName: 'Negotiated custom property', nightlyRate: 9876, status: 'user-edited' }));
  const expected = state.hotelSelections.map((hotel) => [hotel.hotelName, hotel.nightlyRate]);
  const changed = generatePlannerState(state, { hotelCategory: 'Signature Plus' });
  assert.deepEqual(changed.hotelSelections.map((hotel) => [hotel.hotelName, hotel.nightlyRate]), expected);
});
check('reordering verified packages keeps confirmations while real brief changes invalidate them', () => {
  let state = fixture();
  for (const category of categories) state = updatePackageInState(state, category, (view) => ({ ...view,
    hotelSelections: view.hotelSelections.map((hotel) => ({ ...hotel, rateConfirmed: true,
      confirmedSignature: hotelConfirmationSignature(view.plan, hotel, view.input.mealPlan) })) }));
  const promoted = generatePlannerState(state, { packagePreferences: ['Signature Plus', 'Signature Premium'], hotelCategory: 'Signature Plus' });
  for (const category of ['Signature Plus', 'Signature Premium']) {
    assert.ok(packageView(promoted, category).hotelSelections.every((hotel) => hotel.rateConfirmed));
  }
  assert.ok(!packageQuoteReadiness(promoted, 'ready', 'ready').some((issue) => /Verify the/.test(issue)));
  for (const patch of [{ adults: 3 }, { mealPlan: 'Breakfast Only' }, { arrival: '2026-11-02', departure: '2026-11-07' }, { hotelOptionMode: 'multiple' }]) {
    const changed = generatePlannerState(promoted, patch);
    for (const category of ['Signature Plus', 'Signature Premium']) assert.ok(packageView(changed, category).hotelSelections.every((hotel) => !hotel.rateConfirmed), JSON.stringify(patch));
  }
});
check('saved snapshots preserve the comparison and restore single quotes without stale package data', () => {
  const state = fixture(); const snapshot = JSON.parse(JSON.stringify(itinerarySnapshot(state)));
  assert.ok(validPackageQuotes(snapshot.packageQuotes));
  const restored = reconcilePlannerState({ ...snapshot, savedItineraryId: 'restored', hotelDatabase: db });
  categories.forEach((category) => assert.equal(total(restored, category).sellingTotal, total(state, category).sellingTotal));
  const legacy = fixture(['Signature']); delete legacy.packageQuotes;
  assert.equal(itinerarySnapshot(legacy).packageQuotes, undefined);
});
check('all selected packages must be verified before sharing, without requiring extra vehicles', () => {
  let state = fixture();
  for (const category of categories) state = updatePackageInState(state, category, (view) => ({ ...view,
    hotelSelections: view.hotelSelections.map((hotel) => ({ ...hotel, rateConfirmed: true,
      confirmedSignature: hotelConfirmationSignature(view.plan, hotel, view.input.mealPlan) })) }));
  const issues = packageQuoteReadiness(state, 'ready', 'ready');
  assert.ok(!issues.some((issue) => /Verify the|vehicle|positive room rate/.test(issue)), issues.join('\n'));
  const changedPreferences = { ...state, input: { ...state.input, packagePreferences: ['Signature', 'Signature Premium'] } };
  assert.ok(packageQuoteReadiness(changedPreferences, 'ready', 'ready').includes('Rebuild the itinerary after changing trip details.'));
  state = updatePackageInState(state, 'Signature Premium', (view) => ({ ...view,
    hotelSelections: view.hotelSelections.map((hotel, i) => i ? hotel : { ...hotel, rateConfirmed: false }) }));
  assert.ok(packageQuoteReadiness(state, 'ready', 'ready').some((issue) => /^Signature Premium: Verify/.test(issue)));
});
check('unsafe comparison payloads cannot be saved as quote overrides', () => {
  assert.equal(validPackageQuotes({ Unknown: { hotelSelections: [] } }), false);
  assert.equal(validPackageQuotes({ Signature: { hotelSelections: [], costOverrides: { profitPct: 101 } } }), false);
  assert.equal(validPackageQuotes({ Signature: { hotelSelections: [], costOverrides: { activityCosts: {} } } }), false);
  assert.equal(validPackageQuotes({ 'Signature Plus': { hotelSelections: [null] } }), false);
  assert.equal(validPackageQuotes({ 'Signature Plus': { hotelSelections: [{ ...fixture().hotelSelections[0], alternatives: [null] }] } }), false);
  assert.equal(validPackageQuotes({ 'Signature Plus': { hotelSelections: [{ ...fixture().hotelSelections[0], nightlyRate: Infinity }] } }), false);
  assert.equal(validPackageQuotes(undefined), true);
});
console.log(`Package comparison: ${passed} checks passed.`);
