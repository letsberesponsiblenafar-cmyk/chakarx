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
const { createPlan } = require('../lib/itinerary.ts');
const { syncHotelSelections, syncPackageQuotes, updatePackageInState, setHotelOptionRateInState, setSharedCustomHotelRateInState, setSrinagarHouseboatNights, itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { hotelConfirmationSummary, confirmHotelRatesInState } = require('../lib/hotel-confirmation.ts');
const { packageQuoteReadiness } = require('../lib/quote-readiness.ts');
const { packageView } = require('../lib/package-quotes.ts');
const { hotelSelectionKey } = require('../lib/accommodation.ts');
const { calculateCosts } = require('../lib/costing.ts');
const categories = ['Signature', 'Signature Plus', 'Signature Premium'];
const input = { name: 'Rate confirmation QA', arrival: '2026-11-01', departure: '2026-11-06', arrivalTime: '08:00', departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 60000, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'], hotelOptionMode: 'single', packagePreferences: categories };
const db = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri'].flatMap((destination) => categories.flatMap((category, i) => ['hotel', ...(destination === 'Srinagar' ? ['houseboat'] : [])].map((type) => ({
  id: `${destination}-${category}-${type}`, destination, name: `${destination} ${category} ${type}`, normalizedCategory: category, sourceCategory: category, mapB2B: 2000 + i * 1500, extraBedB2B: 500, cnbB2B: 0, starRating: 3 + i, address: '', roomType: type === 'houseboat' ? 'Houseboat' : 'Deluxe', website: '', sourceType: 'Supplier', rateValidity: 'October 2025', availabilityStatus: 'Available', lastUpdated: '2026-10-18', sourceFiles: [], notes: '',
}))));
function fixture(preferences = categories, mode = 'single') {
  const brief = { ...input, hotelCategory: preferences[0], packagePreferences: preferences, hotelOptionMode: mode };
  const plan = createPlan(brief);
  return syncPackageQuotes({ input: brief, plan, routeVersion: 'fixture', hotelDatabase: db,
    hotelSelections: syncHotelSelections(plan, [], db, brief), costModel: { transportDaily: 4321, transportIsCustom: true, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {}, activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 123 },
    hotelDefaults: { rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }, generated: true, savedItineraryId: 'fixture' });
}
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
check('populated single-package database rates require only final confirmation, not editing', () => {
  const state = fixture(['Signature']);
  assert.equal(hotelConfirmationSummary(state).complete, true);
  assert.equal(hotelConfirmationSummary(state).confirmed, false);
  const after = confirmHotelRatesInState(state, true);
  assert.equal(hotelConfirmationSummary(after).confirmed, true);
  assert(!packageQuoteReadiness(after, 'ready', 'ready').some((issue) => /Verify|master rate|positive room rate/.test(issue)));
  assert.deepEqual(after.hotelSelections.map((hotel) => [hotel.nightlyRate, hotel.status]), state.hotelSelections.map((hotel) => [hotel.nightlyRate, hotel.status]));
});
check('one confirmation atomically covers every package without changing prices or cost overrides', () => {
  const state = fixture(); const before = JSON.stringify(state);
  const after = confirmHotelRatesInState(state, true);
  assert.equal(hotelConfirmationSummary(after).confirmed, true);
  for (const category of categories) {
    const a = packageView(state, category); const b = packageView(after, category);
    assert(b.hotelSelections.every((hotel) => hotel.rateConfirmed));
    assert.deepEqual(calculateCosts(a.plan, a.hotelSelections, a.costModel), calculateCosts(b.plan, b.hotelSelections, b.costModel));
  }
  assert.equal(JSON.stringify(state), before, 'Original state is immutable.');
  assert(!packageQuoteReadiness(after, 'ready', 'ready').some((issue) => /Verify|master rate/.test(issue)));
});
check('unchecking the single final checkbox clears all package confirmations', () => {
  const after = confirmHotelRatesInState(confirmHotelRatesInState(fixture(), true), false);
  assert.equal(hotelConfirmationSummary(after).confirmed, false);
  assert(hotelConfirmationSummary(after).packages.every(({ stays }) => stays.every((hotel) => !hotel.rateConfirmed)));
});
check('zero, negative and non-finite room rates prevent confirmation in any package', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    const state = updatePackageInState(fixture(), 'Signature Plus', (view) => ({ ...view, hotelSelections: view.hotelSelections.map((hotel, i) => i ? hotel : { ...hotel, nightlyRate: value }) }));
    assert.equal(hotelConfirmationSummary(state).complete, false);
    assert.strictEqual(confirmHotelRatesInState(state, true), state);
  }
});
check('invalid extra-bed and child rates cannot be confirmed but zero is allowed', () => {
  for (const field of ['extraBedRate', 'cnbRate']) {
    const state = fixture(['Signature']);
    state.hotelSelections[0] = { ...state.hotelSelections[0], [field]: -1 };
    assert.equal(hotelConfirmationSummary(state).complete, false);
    state.hotelSelections[0][field] = 0;
    assert.equal(hotelConfirmationSummary(state).complete, true);
  }
});
check('reopening or focusing unchanged rates does not clear confirmation', () => {
  const state = confirmHotelRatesInState(fixture(), true);
  const hotel = state.hotelSelections[0];
  const unchanged = setHotelOptionRateInState(state, hotelSelectionKey(hotel), hotel.hotelId, 'nightlyRate', hotel.nightlyRate);
  assert.equal(hotelConfirmationSummary(unchanged).confirmed, true);
  assert.equal(hotelConfirmationSummary(syncPackageQuotes(unchanged)).confirmed, true);
  const saved = itinerarySnapshot(unchanged);
  const restored = { ...unchanged, ...JSON.parse(JSON.stringify(saved)) };
  assert.equal(hotelConfirmationSummary(restored).confirmed, true);
});
check('editing a rate makes the changed quote need final confirmation again', () => {
  const state = confirmHotelRatesInState(fixture(), true); const hotel = state.hotelSelections[0];
  const changed = setHotelOptionRateInState(state, hotelSelectionKey(hotel), hotel.hotelId, 'nightlyRate', hotel.nightlyRate + 100);
  assert.equal(hotelConfirmationSummary(changed).confirmed, false);
  assert.equal(hotelConfirmationSummary(confirmHotelRatesInState(changed, true)).confirmed, true);
});
check('database metadata changes alone do not invalidate an agreed quote', () => {
  const state = confirmHotelRatesInState(fixture(), true);
  const changed = { ...state, hotelDatabase: db.map((hotel) => ({ ...hotel, rateValidity: '', mapB2B: hotel.mapB2B + 9000 })) };
  assert.equal(hotelConfirmationSummary(syncPackageQuotes(changed)).confirmed, true);
});
check('houseboats are included in the same final confirmation for every package', () => {
  const state = setSrinagarHouseboatNights(fixture(), [1]);
  const after = confirmHotelRatesInState(state, true);
  assert.equal(hotelConfirmationSummary(after).confirmed, true);
  assert(hotelConfirmationSummary(after).packages.every(({ stays }) => stays.some((hotel) => hotel.accommodationType === 'houseboat' && hotel.rateConfirmed)));
});
check('unpriced alternative properties cannot be hidden by a higher priced option', () => {
  const state = fixture(['Signature'], 'multiple'); const hotel = state.hotelSelections[0];
  hotel.alternatives = [{ ...hotel, customId: 'new-option', hotelId: '', hotelName: 'Custom stay', nightlyRate: 0 }];
  assert.equal(hotelConfirmationSummary(state).complete, false);
});
check('missing names and fractional room counts still need attention', () => {
  for (const patch of [{ hotelName: 'Hotel to be added' }, { rooms: 1.5 }, { cnb: -1 }]) {
    const state = fixture(['Signature']); Object.assign(state.hotelSelections[0], patch);
    assert.equal(hotelConfirmationSummary(state).complete, false);
  }
});
check('shared custom rates remain confirmed when their values are left unchanged', () => {
  const state = fixture(['Signature'], 'multiple');
  Object.assign(state.hotelSelections[0], { hotelId: '', hotelName: 'Custom supplier hotel', source: 'Custom hotel', alternatives: [], sharedCustomRates: { nightlyRate: 4500, extraBedRate: 0, cnbRate: 0 } });
  const confirmed = confirmHotelRatesInState(state, true);
  assert.equal(hotelConfirmationSummary(confirmed).confirmed, true);
  const unchanged = setSharedCustomHotelRateInState(confirmed, hotelSelectionKey(confirmed.hotelSelections[0]), 'nightlyRate', 4500);
  assert.strictEqual(unchanged, confirmed);
  const invalid = { ...confirmed, hotelSelections: confirmed.hotelSelections.map((hotel, index) => index ? hotel : { ...hotel, sharedCustomRates: { nightlyRate: 0, extraBedRate: 0, cnbRate: 0 } }) };
  assert.equal(hotelConfirmationSummary(invalid).complete, false);
});
check('multiple database properties can all be confirmed without editing their rates', () => {
  const state = fixture(['Signature'], 'multiple');
  const hotel = state.hotelSelections[0];
  const original = db.find((record) => record.id === hotel.hotelId);
  state.hotelDatabase = [...db, { ...original, id: 'another-property', name: 'Another supplier hotel' }];
  hotel.alternatives = [{ ...hotel, hotelId: 'another-property', hotelName: 'Another supplier hotel', nightlyRate: 2100 }];
  const confirmed = confirmHotelRatesInState(state, true);
  assert.equal(hotelConfirmationSummary(confirmed).confirmed, true);
  const alternative = confirmed.hotelSelections[0].alternatives[0];
  const unchanged = setHotelOptionRateInState(confirmed, hotelSelectionKey(hotel), alternative.hotelId, 'nightlyRate', alternative.nightlyRate);
  assert.equal(hotelConfirmationSummary(unchanged).confirmed, true);
});
console.log(`Hotel confirmation: ${passed} regressions passed.`);
