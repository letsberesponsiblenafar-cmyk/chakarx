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

const { destinations, replaceDestinationCatalog } = require('../lib/data.ts');
const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip } = require('../lib/itinerary.ts');
const { syncHotelSelections, setSrinagarHouseboatNights, applyPlanEdit, generatePlannerState, reconcilePlannerState, itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { hotelSelectionKey, hotelStayType, hotelStayLabel, hotelNightNumbers, hotelNightDates, hotelStayWindow, activeHotelSelections, hotelForNight, accommodationDayNarrative } = require('../lib/accommodation.ts');
const { isHouseboatHotel } = require('../lib/hotels.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { quoteReadiness, hotelConfirmationSignature } = require('../lib/quote-readiness.ts');
const { pdfHotels, pdfHotelLocation } = require('../components/ClientPdf.tsx');

const originalCatalog = [...destinations];
const dateAfter = (offset) => new Date(Date.UTC(2026, 9, 18 + offset)).toISOString().slice(0, 10);
const input = { name: 'Hotel and houseboat family', arrival: dateAfter(0), departure: dateAfter(6), arrivalTime: '08:00',
  departureTime: '18:30', pickup: 'Srinagar', adults: 4, youngAges: [3, 8], budget: 60000,
  hotelCategory: 'Signature', mealPlan: 'Breakfast & Dinner', transport: 'Sedan', style: 'Balanced', interests: ['Nature'] };
const sequence = ['Srinagar', 'Gulmarg', 'Srinagar', 'Srinagar', 'Pahalgam', 'Srinagar'];

function master(destination, overrides = {}) {
  return { id: `master-${destination}`, destination, name: `${destination} hotel`, sourceCategory: '3 Star',
    normalizedCategory: '3 Star', mapB2B: 2000, extraBedB2B: 700, cnbB2B: 300, starRating: 3,
    address: `${destination} address`, roomType: 'Deluxe room', website: '', sourceType: 'Imported hotel master',
    rateValidity: '2026-10-01 to 2026-11-30', availabilityStatus: 'Available', lastUpdated: '2026-10-12', sourceFiles: [], notes: '', ...overrides };
}
const boatMaster = master('Srinagar', { id: 'master-boat', name: 'Lake Heritage Houseboat', roomType: 'Lake-facing suite', mapB2B: 7300, extraBedB2B: 2100, cnbB2B: 400 });
const database = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg'].map((location) => master(location)).concat(boatMaster);

function planFor(nights) {
  const brief = { ...input, departure: dateAfter(nights.length) };
  let plan = rebuildPlanFromNightSequence(createPlan(brief), nights);
  for (let day = 1; day <= plan.nights; day++) plan = setPlanDayTrip(plan, day, null);
  return plan;
}
function stateFor(nights = sequence, hotels = database) {
  const plan = planFor(nights);
  return { input: plan.input, plan, routeVersion: 'fixture', hotelSelections: plan.hotelPlans.map((stay) => ({
    location: stay.location, hotelId: `master-${stay.location}`, hotelName: `${stay.location} agreed hotel`, category: 'Signature',
    starRating: 4, address: 'Confirmed address', roomType: 'Agreed room', website: '', nights: stay.nights,
    rooms: stay.location === 'Srinagar' ? 3 : 2, extraBeds: 2, cnb: 1, nightlyRate: stay.location === 'Srinagar' ? 1500 : 3000,
    extraBedRate: 500, cnbRate: 300, source: 'Negotiated quote', status: 'user-edited', rateConfirmed: false,
  })), hotelDatabase: hotels,
  costModel: { transportDaily: 5101, transportIsCustom: true, mealPerPersonNight: 0, activityBudget: 0,
    activityCosts: {}, activitySelections: {}, manualInclusions: ['Family assistance'], manualExclusions: ['Airfare'],
    contingencyPct: 0, profitPct: 10, otherAmount: 350 },
  hotelDefaults: { rooms: 2, extraBeds: 1, cnb: 2, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 },
  generated: true, savedItineraryId: 'existing-family-trip' };
}
function srHotel(state) { return state.hotelSelections.find((hotel) => hotel.location === 'Srinagar' && hotelStayType(hotel) === 'hotel'); }
function srBoat(state) { return state.hotelSelections.find((hotel) => hotel.location === 'Srinagar' && hotelStayType(hotel) === 'houseboat'); }
function agree(hotel) {
  const fields = ['hotelId', 'hotelName', 'category', 'starRating', 'address', 'roomType', 'website', 'rooms', 'extraBeds', 'cnb', 'nightlyRate', 'extraBedRate', 'cnbRate', 'source', 'status'];
  return Object.fromEntries(fields.map((key) => [key, hotel[key]]));
}
function dailyCharge(hotel) { return hotel.rooms * hotel.nightlyRate + hotel.extraBeds * hotel.extraBedRate + hotel.cnb * hotel.cnbRate; }
function assertCoverage(state) {
  const active = activeHotelSelections(state.plan, state.hotelSelections);
  const allocated = active.flatMap((hotel) => hotelNightNumbers(state.plan, hotel));
  assert.equal(new Set(allocated).size, allocated.length, 'Two accommodation rows charged the same overnight');
  assert.deepEqual([...allocated].sort((a, b) => a - b), Array.from({ length: state.plan.nights }, (_, index) => index + 1), 'Every route night needs exactly one accommodation');
  for (const hotel of active) {
    assert.equal(hotel.nights, hotelNightNumbers(state.plan, hotel).length, 'Billed nights must match the allocated night numbers');
    for (const night of hotelNightNumbers(state.plan, hotel)) assert.equal(state.plan.dayPlans[night - 1].stay, hotel.location);
  }
}
function readyState(state) {
  const plan = { ...state.plan, dayPlans: state.plan.dayPlans.map((day) => ({ ...day, timing: day.timing && { ...day.timing, issues: [] } })) };
  const hotelSelections = state.hotelSelections.map((hotel) => ({ ...hotel, rateConfirmed: true,
    confirmedSignature: hotelConfirmationSignature(plan, hotel, state.input.mealPlan) }));
  return { ...state, plan, hotelSelections };
}
function readiness(state) { return quoteReadiness(state.plan, state.input, state.hotelSelections, state.costModel, state.hotelDatabase, 'ready', 'ready'); }
function agreeBoat(state) {
  return { ...state, hotelSelections: state.hotelSelections.map((hotel) => hotelStayType(hotel) === 'houseboat'
    ? { ...hotel, nightlyRate: 8123, extraBedRate: 1621, cnbRate: 321, rooms: 2, extraBeds: 1, cnb: 2, status: 'user-edited' }
    : hotel) };
}

const failures = [];
let checks = 0;
function test(name, run) {
  try { run(); checks++; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push({ name, error }); process.stderr.write(`FAIL ${name}: ${error.stack || error.message}\n`); }
}

try {
  // No paid activities are needed for these accommodation tests; leave the
  // sightseeing library otherwise intact, including the route intelligence.
  replaceDestinationCatalog(originalCatalog.map((destination) => ({ ...destination, activities: [], enabled_activities: [] })));

  test('legacy Srinagar quotes remain entirely in the selected hotel until houseboat nights are chosen', () => {
    const state = reconcilePlannerState(stateFor(['Srinagar', 'Srinagar']));
    assert.equal(state.hotelSelections.length, 1);
    assert.equal(hotelStayType(srHotel(state)), 'hotel');
    assert.deepEqual(hotelNightNumbers(state.plan, srHotel(state)), [1, 2]);
    assert.equal(srBoat(state), undefined);
    assertCoverage(state);
  });

  test('two Srinagar nights can be split into one hotel night and one houseboat night', () => {
    const before = stateFor(['Srinagar', 'Srinagar']);
    const after = setSrinagarHouseboatNights(before, [1]);
    assert.deepEqual(hotelNightNumbers(after.plan, srBoat(after)), [1]);
    assert.deepEqual(hotelNightNumbers(after.plan, srHotel(after)), [2]);
    assert.equal(srBoat(after).hotelId, boatMaster.id);
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)), 'Splitting nights must retain the agreed hotel quote');
    assert.deepEqual(after.costModel, before.costModel);
    assert.equal(after.input.transport, before.input.transport);
    assertCoverage(after);
  });

  test('multiple non-consecutive Srinagar nights support both accommodation types', () => {
    const before = stateFor();
    const after = setSrinagarHouseboatNights(before, [1, 4]);
    assert.deepEqual(hotelNightNumbers(after.plan, srBoat(after)), [1, 4]);
    assert.deepEqual(hotelNightNumbers(after.plan, srHotel(after)), [3, 6]);
    assert.deepEqual(after.hotelSelections.filter((hotel) => hotel.location !== 'Srinagar'), before.hotelSelections.filter((hotel) => hotel.location !== 'Srinagar'));
    assertCoverage(after);
  });

  test('all Srinagar nights may use the houseboat without charging the cached hotel quote', () => {
    const before = stateFor(['Srinagar', 'Srinagar']);
    const after = setSrinagarHouseboatNights(before, [1, 2]);
    assert.equal(srHotel(after).nights, 0);
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)), 'The unused hotel remains available if nights are moved back');
    const active = activeHotelSelections(after.plan, after.hotelSelections);
    assert.equal(active.length, 1);
    assert.equal(hotelStayType(active[0]), 'houseboat');
    assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).accommodation, 2 * dailyCharge(srBoat(after)));
    assertCoverage(after);
  });

  test('switching back to all-hotel retains both negotiated quotes and charges only the hotel', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1]));
    const after = setSrinagarHouseboatNights(before, []);
    assert.equal(srBoat(after).nights, 0);
    assert.deepEqual(agree(srBoat(after)), agree(srBoat(before)));
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)));
    assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).accommodation, 2 * dailyCharge(srHotel(after)));
    const resumed = setSrinagarHouseboatNights(after, [2]);
    assert.deepEqual(agree(srBoat(resumed)), agree(srBoat(before)), 'Reusing the selected houseboat must not load new master rates');
    assertCoverage(resumed);
  });

  test('split hotel and houseboat room counts, extra beds and CNB rates are billed separately exactly once', () => {
    const state = agreeBoat(setSrinagarHouseboatNights(stateFor(), [1, 4]));
    const cost = calculateCosts(state.plan, state.hotelSelections, state.costModel);
    const expected = activeHotelSelections(state.plan, state.hotelSelections).reduce((sum, hotel) => sum + hotel.nights * dailyCharge(hotel), 0);
    assert.equal(cost.accommodation, expected);
    assert.equal(cost.transport, state.plan.days * 5101);
    assert.equal(cost.b2bCost, expected + state.plan.days * 5101 + 350);
    assert.ok(Math.abs(cost.sellingTotal - cost.b2bCost * 1.1 * 1.05) < 0.000001);
  });

  test('regular Srinagar hotel suggestions never silently choose a cheaper houseboat', () => {
    const cheapBoat = { ...boatMaster, mapB2B: 1 };
    const state = stateFor(['Srinagar', 'Srinagar'], [cheapBoat, master('Srinagar')]);
    const selected = syncHotelSelections(state.plan, [], state.hotelDatabase, state.input);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].hotelId, 'master-Srinagar');
    assert.equal(isHouseboatHotel({ ...master('Srinagar'), name: 'Lake Palace', roomType: 'Houseboat suite' }), true);
    assert.equal(isHouseboatHotel({ ...master('Srinagar'), name: 'Lake Palace', sourceCategory: 'Deluxe Houseboat' }), true);
    assert.equal(isHouseboatHotel(master('Srinagar')), false);
  });

  test('a new houseboat choice suggests only a houseboat while preserving the existing hotel', () => {
    const state = stateFor(['Srinagar', 'Srinagar'], [master('Srinagar', { mapB2B: 1 }), boatMaster]);
    const after = setSrinagarHouseboatNights(state, [2]);
    assert.equal(srBoat(after).hotelId, boatMaster.id);
    assert.equal(srBoat(after).nightlyRate, boatMaster.mapB2B);
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(state)));
  });

  test('missing houseboat data produces an explicit zero-rate houseboat placeholder rather than another hotel', () => {
    const after = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar'], [master('Srinagar')]), [2]);
    assert.equal(srBoat(after).hotelId, '');
    assert.equal(srBoat(after).hotelName, 'Houseboat to be added');
    assert.equal(srBoat(after).nightlyRate, 0);
    assert.ok(calculateCosts(after.plan, after.hotelSelections, after.costModel).missingHotelRates.some((label) => /houseboat/i.test(label)));
    assert.ok(readiness(readyState(after)).some((issue) => /houseboat/i.test(issue) && /rate|add|select/i.test(issue)));
    assertCoverage(after);
  });

  test('invalid, duplicate and non-Srinagar night allocations are rejected without changing the quote', () => {
    const before = stateFor();
    const original = JSON.stringify(before);
    for (const invalid of [[0], [2], [5], [7], [1.5], [1, 1], [-1], [NaN]]) {
      assert.throws(() => setSrinagarHouseboatNights(before, invalid), undefined, `Invalid allocation ${String(invalid)} was accepted`);
      assert.equal(JSON.stringify(before), original, 'Rejected input mutated the previous quote');
    }
  });

  test('night dates and per-night hotel lookup follow the allocated type rather than the whole destination', () => {
    const state = setSrinagarHouseboatNights(stateFor(), [1, 4]);
    const boat = srBoat(state), hotel = srHotel(state);
    assert.deepEqual(hotelNightDates(state.plan, boat), [dateAfter(0), dateAfter(3)]);
    assert.deepEqual(hotelNightDates(state.plan, hotel), [dateAfter(2), dateAfter(5)]);
    assert.equal(hotelStayWindow(state.plan, boat).arrival, dateAfter(0));
    assert.equal(hotelStayWindow(state.plan, boat).departure, dateAfter(4));
    assert.equal(hotelForNight(state.plan, state.hotelSelections, 1).hotelId, boat.hotelId);
    assert.equal(hotelForNight(state.plan, state.hotelSelections, 3).hotelId, hotel.hotelId);
    assert.equal(hotelForNight(state.plan, state.hotelSelections, 2).location, 'Gulmarg');
    assert.notEqual(hotelSelectionKey(boat), hotelSelectionKey(hotel));
    assert.match(hotelStayLabel(boat), /houseboat/i);
  });

  test('hotel-master refreshes cannot overwrite either accommodation quote or their independent room setups', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(), [1, 4]));
    const database = before.hotelDatabase.map((hotel) => ({ ...hotel, name: `Changed ${hotel.name}`, mapB2B: 99999, extraBedB2B: 9999, cnbB2B: 999 }));
    const after = reconcilePlannerState({ ...before, hotelDatabase: database });
    assert.deepEqual(agree(srBoat(after)), agree(srBoat(before)));
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)));
    assert.deepEqual(hotelNightNumbers(after.plan, srBoat(after)), [1, 4]);
    assertCoverage(after);
  });

  test('selected hotel and houseboat agreements remain stable during a temporary missing master record', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(), [1, 4]));
    const after = reconcilePlannerState({ ...before, hotelDatabase: [] });
    assert.deepEqual(agree(srBoat(after)), agree(srBoat(before)));
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)));
    assertCoverage(after);
  });

  test('saved snapshots restore the split nights, independent prices and selected transport exactly', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(), [1, 4]));
    const snapshot = JSON.parse(JSON.stringify(itinerarySnapshot(before)));
    const after = reconcilePlannerState({ ...snapshot, hotelDatabase: database, savedItineraryId: 'reloaded-family-trip' });
    assert.deepEqual(agree(srBoat(after)), agree(srBoat(before)));
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)));
    assert.deepEqual(hotelNightNumbers(after.plan, srBoat(after)), [1, 4]);
    assert.deepEqual(after.costModel, before.costModel);
    assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).sellingTotal, calculateCosts(before.plan, before.hotelSelections, before.costModel).sellingTotal);
    assertCoverage(after);
  });

  test('duration replanning preserves the chosen houseboat-night count and both agreed rates', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(['Srinagar', 'Gulmarg', 'Pahalgam', 'Srinagar']), [1]));
    const after = generatePlannerState(before, { departure: dateAfter(6) });
    assert.equal(after.plan.days, 7);
    assert.equal(srBoat(after).nights, 1);
    assert.deepEqual(agree(srBoat(after)), agree(srBoat(before)));
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)));
    assert.equal(after.costModel.transportDaily, before.costModel.transportDaily);
    assert.equal(after.input.transport, before.input.transport);
    assertCoverage(after);
  });

  test('new Srinagar nights default to the retained hotel rather than expanding the houseboat booking', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1]));
    const extended = planFor(['Srinagar', 'Srinagar', 'Srinagar', 'Srinagar']);
    const after = applyPlanEdit({ ...before, input: extended.input }, extended);
    assert.deepEqual(hotelNightNumbers(after.plan, srBoat(after)), [1]);
    assert.deepEqual(hotelNightNumbers(after.plan, srHotel(after)), [2, 3, 4]);
    const oldCost = calculateCosts(before.plan, before.hotelSelections, before.costModel);
    const newCost = calculateCosts(after.plan, after.hotelSelections, after.costModel);
    assert.equal(newCost.accommodation - oldCost.accommodation, 2 * dailyCharge(srHotel(before)));
    assertCoverage(after);
  });

  test('route edits keep valid preferred houseboat nights and relocate only displaced bookings', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(), [1, 4]));
    const edited = planFor(['Srinagar', 'Srinagar', 'Gulmarg', 'Pahalgam', 'Srinagar', 'Gulmarg']);
    const after = applyPlanEdit({ ...before, input: edited.input }, edited);
    assert.equal(srBoat(after).nights, 2);
    assert.deepEqual(hotelNightNumbers(after.plan, srBoat(after)), [1, 2]);
    assert.deepEqual(hotelNightNumbers(after.plan, srHotel(after)), [5]);
    assert.deepEqual(agree(srBoat(after)), agree(srBoat(before)));
    assert.deepEqual(agree(srHotel(after)), agree(srHotel(before)));
    assertCoverage(after);
  });

  test('shorter Srinagar allocations cap houseboat nights and never produce negative hotel nights', () => {
    const before = agreeBoat(setSrinagarHouseboatNights(stateFor(), [1, 3, 4]));
    const edited = planFor(['Srinagar', 'Gulmarg', 'Pahalgam']);
    const after = applyPlanEdit({ ...before, input: edited.input }, edited);
    assert.equal(srBoat(after).nights, 1);
    assert.equal(srHotel(after).nights, 0);
    assert.deepEqual(hotelNightNumbers(after.plan, srBoat(after)), [1]);
    assertCoverage(after);
  });

  test('valid disjoint hotel and houseboat rows pass accommodation readiness together', () => {
    const state = readyState(setSrinagarHouseboatNights(stateFor(), [1, 4]));
    assert.deepEqual(readiness(state), [], 'A legitimate split cannot be rejected as duplicate hotels or mismatched route nights');
    const signature = hotelConfirmationSignature(state.plan, srBoat(state), state.input.mealPlan);
    const swapped = setSrinagarHouseboatNights(state, [3, 6]);
    assert.notEqual(hotelConfirmationSignature(swapped.plan, srBoat(swapped), swapped.input.mealPlan), signature, 'Moving houseboat dates must invalidate its verification even with the same night count');
  });

  test('zero-night quote caches do not add readiness requirements or PDF accommodation rows', () => {
    const state = readyState(setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1, 2]));
    srHotel(state).nightlyRate = 0;
    srHotel(state).rateConfirmed = false;
    assert.deepEqual(readiness(state), [], 'An unused hotel must not block a fully priced houseboat itinerary');
    assert.equal(activeHotelSelections(state.plan, state.hotelSelections).length, 1);
    const rows = pdfHotels(state.plan, state.hotelSelections, state.input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hotelId, srBoat(state).hotelId);
    assert.equal(pdfHotelLocation(rows, rows[0]), 'Srinagar · Houseboat');
  });

  test('client PDF accommodation rows distinguish the two Srinagar properties without night-number suffixes', () => {
    const state = setSrinagarHouseboatNights(stateFor(), [1, 4]);
    const rows = pdfHotels(state.plan, state.hotelSelections, state.input);
    const srinagar = rows.filter((hotel) => hotel.location === 'Srinagar');
    assert.equal(srinagar.length, 2);
    assert.deepEqual(srinagar.map((hotel) => pdfHotelLocation(rows, hotel)), ['Srinagar · Hotel', 'Srinagar · Houseboat']);
    assert.deepEqual(srinagar.map((hotel) => hotel.hotelName), [srHotel(state).hotelName, srBoat(state).hotelName]);
    assert.equal(rows.filter((hotel) => hotel.location === 'Gulmarg').length, 1);
    assert.equal(rows.filter((hotel) => hotel.location === 'Pahalgam').length, 1);
  });

  test('readiness rejects overlapping or uncovered night allocations instead of allowing double charges', () => {
    const before = readyState(setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1]));
    for (const hotelNumbers of [[1], []]) {
      const corrupt = { ...before, hotelSelections: before.hotelSelections.map((hotel) => hotelStayType(hotel) === 'hotel'
        ? { ...hotel, nightNumbers: hotelNumbers, nights: hotelNumbers.length } : hotel) };
      assert.ok(readiness(corrupt).some((issue) => /night|allocation|overlap|assign/i.test(issue)), 'An invalid split must be visible before sharing');
    }
  });

  test('early-departure final Srinagar night supports a houseboat without changing the departure rule', () => {
    const state = stateFor(['Srinagar', 'Gulmarg', 'Srinagar']);
    state.input = { ...state.input, departureTime: '12:00' };
    state.plan = { ...state.plan, input: state.input };
    const after = setSrinagarHouseboatNights(state, [3]);
    assert.equal(after.plan.dayPlans[after.plan.nights - 1].stay, 'Srinagar');
    assert.equal(hotelStayType(hotelForNight(after.plan, after.hotelSelections, 3)), 'houseboat');
    assertCoverage(after);
  });

  test('houseboat arrival descriptions use the booked accommodation for check-in and overnight', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1, 2]);
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, state.plan.dayPlans[0], state.input.pickup, state.costModel);
    assert.match(copy, /Check in to your Srinagar houseboat\./);
    assert.match(copy, /Overnight on your houseboat in Srinagar\./);
    assert.doesNotMatch(copy, /your Srinagar hotel|Overnight in Srinagar\./i);
  });

  test('a transfer after a houseboat night checks out from the houseboat and checks into the next destination', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Gulmarg', 'Srinagar']), [1]);
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, state.plan.dayPlans[1], state.input.pickup, state.costModel);
    assert.match(copy, /check out from your Srinagar houseboat\./i);
    assert.match(copy, /Gulmarg/);
    assert.match(copy, /check in/i);
    assert.doesNotMatch(copy, /check out from your Srinagar hotel|Overnight on your houseboat/i);
  });

  test('changing from a Srinagar hotel to a houseboat describes both same-city accommodation moves', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [2]);
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, state.plan.dayPlans[1], state.input.pickup, state.costModel);
    assert.match(copy, /check out from your Srinagar hotel\./i);
    assert.match(copy, /check in to your Srinagar houseboat\./i);
    assert.match(copy, /Overnight on your houseboat in Srinagar\./);
    assert.doesNotMatch(copy, /breakfast at your Srinagar houseboat/i, 'Breakfast is at the previous hotel, before the houseboat check-in');
  });

  test('changing from a Srinagar houseboat to a hotel describes both same-city accommodation moves', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1]);
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, state.plan.dayPlans[1], state.input.pickup, state.costModel);
    assert.match(copy, /check out from your Srinagar houseboat\./i);
    assert.match(copy, /check in to your Srinagar hotel\./i);
    assert.match(copy, /Overnight in Srinagar\./);
    assert.doesNotMatch(copy, /Overnight on your houseboat/i);
  });

  test('consecutive houseboat nights retain the same accommodation without inventing another transfer', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1, 2]);
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, state.plan.dayPlans[1], state.input.pickup, state.costModel);
    assert.match(copy, /Overnight on your houseboat in Srinagar\./);
    assert.doesNotMatch(copy, /check out|check in|your Srinagar hotel/i);
  });

  test('day-visit returns check into the newly selected houseboat after leaving the previous hotel', () => {
    const before = stateFor(['Srinagar', 'Srinagar']);
    const excursion = setPlanDayTrip(before.plan, 2, 'Gulmarg');
    const state = setSrinagarHouseboatNights({ ...before, plan: excursion }, [2]);
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, state.plan.dayPlans[1], state.input.pickup, state.costModel);
    assert.match(copy, /check out from your Srinagar hotel\./i);
    assert.match(copy, /Return to Srinagar after your visit and check in to your houseboat\./);
    assert.match(copy, /Overnight on your houseboat in Srinagar\./);
    assert.doesNotMatch(copy, /check in to your hotel/i);
  });

  test('returning from another destination checks into the Srinagar houseboat rather than a hotel', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Gulmarg', 'Srinagar']), [3]);
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, state.plan.dayPlans[2], state.input.pickup, state.costModel);
    assert.match(copy, /check out from your Gulmarg hotel\./i);
    assert.match(copy, /Check in to your houseboat on arrival\./);
    assert.match(copy, /Overnight on your houseboat in Srinagar\./);
    assert.doesNotMatch(copy, /your Srinagar hotel/i);
  });

  test('departure logistics check out from the previous night houseboat instead of a hotel', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [2]);
    const departure = state.plan.dayPlans[state.plan.nights];
    const copy = accommodationDayNarrative(state.plan, state.hotelSelections, departure, state.input.pickup, state.costModel);
    assert.match(copy, /check out from your Srinagar houseboat\./i);
    assert.match(copy, /departure point|onward journey/i);
    assert.doesNotMatch(copy, /your Srinagar hotel|Overnight/i);
  });

  test('manual About This Day copy stays authoritative when a houseboat is assigned', () => {
    const state = setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [1]);
    const manual = 'Meet your private host for a carefully arranged lakeside welcome. The hotel reception is our meeting point.';
    const day = { ...state.plan.dayPlans[0], customAbout: manual };
    assert.equal(accommodationDayNarrative(state.plan, state.hotelSelections, day, state.input.pickup, state.costModel), manual);
  });

  test('a placeholder houseboat remains incomplete even if a positive rate has been entered', () => {
    const state = readyState(setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar'], [master('Srinagar')]), [2]));
    srBoat(state).nightlyRate = 6000;
    const cost = calculateCosts(state.plan, state.hotelSelections, state.costModel);
    assert.ok(cost.missingHotelRates.some((label) => /houseboat/i.test(label)), 'A room rate is not a selected houseboat name');
    assert.ok(readiness(state).some((issue) => /add a houseboat/i.test(issue)));
  });

  test('complimentary child and extra-bed rates stay zero without marking the selected houseboat incomplete', () => {
    const state = readyState(setSrinagarHouseboatNights(stateFor(['Srinagar', 'Srinagar']), [2]));
    const boat = srBoat(state);
    boat.cnb = 2;
    boat.cnbRate = 0;
    boat.extraBeds = 1;
    boat.extraBedRate = 0;
    boat.confirmedSignature = hotelConfirmationSignature(state.plan, boat, state.input.mealPlan);
    assert.deepEqual(readiness(state), []);
    const refreshed = reconcilePlannerState(state);
    assert.equal(srBoat(refreshed).cnbRate, 0);
    assert.equal(srBoat(refreshed).extraBedRate, 0);
    const cost = calculateCosts(refreshed.plan, refreshed.hotelSelections, refreshed.costModel);
    assert.equal(cost.accommodation, dailyCharge(srHotel(refreshed)) + srBoat(refreshed).rooms * srBoat(refreshed).nightlyRate);
    assert.deepEqual(cost.missingHotelRates, []);
  });
} finally {
  replaceDestinationCatalog(originalCatalog);
}

if (failures.length) {
  process.stderr.write(`\n${failures.length} houseboat stay checks failed.\n`);
  process.exitCode = 1;
} else console.log(`Houseboat stays: ${checks} checks passed.`);
