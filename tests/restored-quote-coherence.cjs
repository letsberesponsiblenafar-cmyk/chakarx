const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};

const { createPlan, rebuildPlanFromNightSequence } = require('../lib/itinerary.ts');
const { reconcilePlannerState, itinerarySnapshot, syncHotelSelections } = require('../components/PlannerProvider.tsx');
const { quoteReadiness, hotelConfirmationSignature } = require('../lib/quote-readiness.ts');
const { calculateCosts } = require('../lib/costing.ts');

const input = { name: 'Restored quote QA', arrival: '2026-10-12', departure: '2026-10-17', arrivalTime: '08:00',
  departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 60000, hotelCategory: 'Signature',
  mealPlan: 'Breakfast & Dinner', transport: 'Sedan', style: 'Balanced', interests: ['Nature'] };
const model = { transportDaily: 1000, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0,
  activityCosts: {}, activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0,
  profitPct: 0, otherAmount: 0 };
const defaults = { rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 };

function selectedHotel(location, nights, overrides = {}) {
  return { location, hotelId: '', hotelName: `${location} negotiated hotel`, category: 'Signature', starRating: null,
    address: '', roomType: 'Operator selected room', website: '', nights, rooms: 1, extraBeds: 0, cnb: 0,
    nightlyRate: 1000, extraBedRate: 0, cnbRate: 0, source: 'Custom hotel', status: 'user-edited', rateConfirmed: true,
    ...overrides };
}
function stateFor(sequence) {
  const trip = { ...input, departure: new Date(Date.UTC(2026, 9, 12 + sequence.length)).toISOString().slice(0, 10) };
  const plan = rebuildPlanFromNightSequence(createPlan(trip), sequence);
  const hotels = plan.hotelPlans.map((stay) => selectedHotel(stay.location, stay.nights));
  for (const hotel of hotels) hotel.confirmedSignature = hotelConfirmationSignature(plan, hotel, trip.mealPlan);
  return { input: trip, plan, routeVersion: null, hotelSelections: hotels, hotelDatabase: [], costModel: model,
    hotelDefaults: defaults, generated: true, savedItineraryId: 'saved-client-fixture' };
}
function restoredEarlyState(sequence) {
  const state = stateFor(sequence);
  // Older drafts could have an early departure and an outlying final hotel.
  const early = { ...state.input, departureTime: '13:00' };
  return { ...state, input: early, plan: { ...state.plan, input: early,
    dayPlans: state.plan.dayPlans.map((day) => day.label === 'Departure day' ? { ...day, departureTime: early.departureTime } : day) } };
}

{
  const old = restoredEarlyState(['Srinagar', 'Gulmarg', 'Srinagar', 'Pahalgam', 'Pahalgam']);
  const unchangedHotel = old.hotelSelections.find((hotel) => hotel.location === 'Gulmarg');
  Object.assign(unchangedHotel, { rooms: 3, extraBeds: 1, nightlyRate: 4321, extraBedRate: 345 });
  unchangedHotel.confirmedSignature = hotelConfirmationSignature(old.plan, unchangedHotel, old.input.mealPlan);
  const normalised = reconcilePlannerState(old);
  assert.equal(normalised.plan.dayPlans[normalised.plan.nights - 1].stay, 'Srinagar');
  assert.deepEqual(normalised.hotelSelections.map((hotel) => [hotel.location, hotel.nights]), normalised.plan.hotelPlans.map((stay) => [stay.location, stay.nights]));
  assert.deepEqual(normalised.hotelSelections.find((hotel) => hotel.location === 'Gulmarg'), unchangedHotel, 'Unchanged negotiated stays and verification must be preserved');
  for (const location of ['Srinagar', 'Pahalgam']) assert.equal(normalised.hotelSelections.find((hotel) => hotel.location === location).rateConfirmed, false, `${location} changed dates/nights must clear verification`);
  assert.equal(normalised.savedItineraryId, old.savedItineraryId, 'A corrected route remains the same client itinerary');
  const snapshot = itinerarySnapshot(normalised);
  assert.equal(snapshot.plan.dayPlans[snapshot.plan.nights - 1].stay, 'Srinagar', 'The saved snapshot must contain the enforced final night');
  assert.deepEqual(snapshot.hotelSelections.map((hotel) => [hotel.location, hotel.nights]), snapshot.plan.hotelPlans.map((stay) => [stay.location, stay.nights]));
  assert.deepEqual(reconcilePlannerState(normalised).hotelSelections, normalised.hotelSelections, 'Repeated rescheduling must not reset unaffected edits');
}

{
  const old = restoredEarlyState(['Srinagar', 'Gulmarg', 'Srinagar', 'Pahalgam']);
  const normalised = reconcilePlannerState(old);
  assert.ok(!normalised.hotelSelections.some((hotel) => hotel.location === 'Pahalgam'), 'A removed overnight must not leave a charged hotel row');
  assert.ok(normalised.plan.dayPlans.some((day) => day.dayTripDestination === 'Pahalgam'), 'The former overnight destination should remain a daytime visit');
  const expected = normalised.plan.hotelPlans.reduce((sum, stay) => sum + stay.nights * 1000, 0);
  assert.equal(calculateCosts(normalised.plan, normalised.hotelSelections, model).accommodation, expected);
}

{
  const state = stateFor(['Srinagar']);
  const stale = { ...state.hotelSelections[0], nights: 99 };
  stale.confirmedSignature = hotelConfirmationSignature(state.plan, stale, state.input.mealPlan);
  const extra = selectedHotel('Pahalgam', 1);
  const issues = quoteReadiness(state.plan, state.input, [stale, extra], model, [], 'ready', 'ready');
  assert.ok(issues.some((issue) => issue.includes('allocation to 1 night')), 'A stale count must block sharing');
  assert.ok(issues.some((issue) => issue.includes('no overnight stay')), 'A stale hotel destination must block sharing');
  assert.equal(calculateCosts(state.plan, [stale, extra], model).accommodation, 1000, 'One route night must cost 1000, not 100000 from stale hotel rows');
  assert.deepEqual(calculateCosts(state.plan, [], model).missingHotelRates, ['Srinagar'], 'Missing selected stays must appear in costing checks');
}

{
  const state = stateFor(['Srinagar']);
  const master = { id: 'known-stay', name: 'Known hotel', destination: 'Srinagar', normalizedCategory: '3 Star',
    mapB2B: 3000, extraBedB2B: 500, cnbB2B: 100, starRating: 3, address: '', roomType: '', website: '',
    sourceType: 'Master', availabilityStatus: 'Available', rateValidity: '' };
  const hotel = selectedHotel('Srinagar', 1, { hotelId: master.id, hotelName: master.name, rooms: 3, extraBeds: 2,
    nightlyRate: 4321, extraBedRate: 678, status: 'common hotel policy applied' });
  const synced = syncHotelSelections(state.plan, [hotel], [master], state.input)[0];
  assert.equal(synced.rooms, 3, 'Route and database refreshes must preserve operator room setup');
  assert.equal(synced.extraBeds, 2);
  assert.equal(synced.nightlyRate, 4321, 'A common negotiated price must not be overwritten by the master rate');
  assert.equal(synced.extraBedRate, 678);
}

{
  const state = stateFor(['Srinagar', 'Gulmarg', 'Srinagar', 'Pahalgam', 'Srinagar']);
  const hotel = state.hotelSelections.find((item) => item.location === 'Srinagar');
  const signature = hotelConfirmationSignature(state.plan, hotel, state.input.mealPlan);
  const changed = { ...state.plan, dayPlans: state.plan.dayPlans.map((day) => day.day === 3 ? { ...day, stay: 'Gulmarg' } : day) };
  assert.notEqual(hotelConfirmationSignature(changed, hotel, state.input.mealPlan), signature, 'Changing an interior hotel night must invalidate confirmation even with unchanged first/last dates');
  const old = restoredEarlyState(['Srinagar', 'Pahalgam']);
  assert.ok(quoteReadiness(old.plan, old.input, old.hotelSelections, model, [], 'ready', 'ready').some((issue) => issue.includes('final night in Srinagar')), 'Raw unnormalised early-departure drafts must block PDF sharing');
}

console.log('Restored route, hotel allocation, verification and costing coherence checks passed.');
