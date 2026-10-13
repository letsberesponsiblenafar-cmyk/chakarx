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
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};

const { createPlan } = require('../lib/itinerary.ts');
const { syncHotelSelections, generatePlannerState, reconcilePlannerState, setSrinagarHouseboatNights, replaceHotelInState, replaceHotelAlternativeInState, setCustomHotelAlternativeInState, setHotelOptionRateInState, itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { hotelOptions, hotelOptionNames, hotelOptionIdentity, isUnusedHotelOption, effectiveHotelSelection, hotelOptionNightlyCost } = require('../lib/hotel-options.ts');
const { hotelSelectionKey, hotelStayType, hotelNightNumbers } = require('../lib/accommodation.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { hotelConfirmationSignature, quoteReadiness } = require('../lib/quote-readiness.ts');
const { pdfHotelName } = require('../components/ClientPdf.tsx');

const input = { name: 'Custom hotel option regression', arrival: '2026-10-18', departure: '2026-10-23', arrivalTime: '08:00', departureTime: '18:00', pickup: 'Srinagar', adults: 4, youngAges: [3, 8], budget: 60000, hotelCategory: 'Signature', mealPlan: 'Breakfast & Dinner', transport: 'Sedan', style: 'Balanced', interests: ['Nature'], hotelOptionMode: 'multiple' };
const destinations = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri', 'Naranag'];
function master(location, suffix = 'main', rate = 2000, overrides = {}) {
  return { id: `${location}-${suffix}`, destination: location, name: `${location} ${suffix} Hotel`, sourceCategory: '3 Star', normalizedCategory: '3 Star', starRating: 3, address: `${location} address`, roomType: 'Deluxe room', website: '', mapB2B: rate, extraBedB2B: 700, cnbB2B: 300, sourceType: 'Imported master', rateValidity: '2026-10-01 to 2026-11-30', availabilityStatus: 'Available', lastUpdated: '2026-10-12', sourceFiles: [], notes: '', ...overrides };
}
const sparseDatabase = destinations.map((location) => master(location));
const fullDatabase = destinations.flatMap((location) => [master(location), master(location, 'second', 2100), master(location, 'third', 2200)]);
function stateFor(db = sparseDatabase) {
  const plan = createPlan(input);
  return { input: { ...input }, plan, routeVersion: 'fixture', hotelSelections: syncHotelSelections(plan, [], db, input), hotelDatabase: db, costModel: { transportDaily: 4321, transportIsCustom: true, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {}, activitySelections: {}, manualInclusions: ['Welcome assistance'], manualExclusions: ['Flights'], contingencyPct: 0, profitPct: 10, otherAmount: 123 }, hotelDefaults: { rooms: 2, extraBeds: 1, cnb: 1, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }, generated: true, savedItineraryId: 'custom-option-quote' };
}
const firstStay = (state) => state.hotelSelections[0];
const keyFor = (state) => hotelSelectionKey(firstStay(state));
const selected = (state, key) => state.hotelSelections.find((hotel) => hotelSelectionKey(hotel) === key);
function custom(state, index, patch, key = keyFor(state)) { return setCustomHotelAlternativeInState(state, key, index, patch); }
function confirmed(state) {
  return { ...state, hotelSelections: state.hotelSelections.map((hotel) => ({ ...hotel, rateConfirmed: true, confirmedSignature: hotelConfirmationSignature(state.plan, hotel, state.input.mealPlan) })) };
}
function readiness(state) { return quoteReadiness(state.plan, state.input, state.hotelSelections, state.costModel, state.hotelDatabase, 'ready', 'ready'); }
let checks = 0;
const failures = [];
function test(name, run) { try { run(); checks++; process.stdout.write(`PASS ${name}\n`); } catch (error) { failures.push(error); process.stderr.write(`FAIL ${name}: ${error.stack}\n`); } }

test('no comparable supplier leaves both alternative positions available for custom quotes', () => {
  const before = stateFor();
  assert.equal(hotelOptions(firstStay(before), 'multiple').length, 1);
  const after = custom(custom(before, 0, {}), 1, {});
  const stay = firstStay(after);
  assert.equal(stay.alternatives.length, 2);
  assert(stay.alternatives.every((option) => option.hotelId === '' && option.hotelName === '' && isUnusedHotelOption(option)));
  assert.equal(hotelOptions(stay, 'multiple').length, 1);
});

test('one comparable supplier remains selected when the remaining slot is made custom', () => {
  const before = stateFor(destinations.flatMap((location) => [master(location), master(location, 'second', 2100)]));
  const existing = firstStay(before).alternatives[0];
  const after = custom(before, 1, {});
  assert.deepEqual(firstStay(after).alternatives[0], existing);
  assert(isUnusedHotelOption(firstStay(after).alternatives[1]));
  assert.equal(hotelOptions(firstStay(after), 'multiple').length, 2);
});

test('editing the second missing slot first does not move it to the first slot', () => {
  const before = stateFor();
  const after = custom(before, 1, { hotelName: 'Second custom supplier', nightlyRate: 2500 });
  assert.equal(firstStay(after).alternatives.length, 2);
  assert(isUnusedHotelOption(firstStay(after).alternatives[0]));
  assert.equal(firstStay(after).alternatives[1].hotelName, 'Second custom supplier');
  const again = custom(after, 0, { hotelName: 'First custom supplier', nightlyRate: 2400 });
  assert.equal(firstStay(again).alternatives[1].customId, firstStay(after).alternatives[1].customId);
  assert.equal(firstStay(again).alternatives[1].hotelName, 'Second custom supplier');
});

test('separate custom choices have stable unique identities even with a custom primary', () => {
  let before = stateFor();
  before = { ...before, hotelSelections: [{ ...firstStay(before), hotelId: '', hotelName: 'Custom primary', source: 'Custom hotel' }, ...before.hotelSelections.slice(1)] };
  const withBoth = custom(custom(before, 0, { hotelName: 'Custom first', nightlyRate: 2100 }), 1, { hotelName: 'Custom second', nightlyRate: 2200 });
  const stay = firstStay(withBoth);
  const firstId = hotelOptionIdentity(stay.alternatives[0]);
  const secondId = hotelOptionIdentity(stay.alternatives[1]);
  assert(firstId && secondId && firstId !== secondId);
  assert.equal(stay.alternatives[0].hotelId, '');
  assert.equal(stay.alternatives[1].hotelId, '');
  const changed = setHotelOptionRateInState(withBoth, keyFor(withBoth), secondId, 'nightlyRate', 2345);
  assert.equal(firstStay(changed).nightlyRate, stay.nightlyRate);
  assert.deepEqual(firstStay(changed).alternatives[0], stay.alternatives[0]);
  assert.equal(firstStay(changed).alternatives[1].nightlyRate, 2345);
  assert.equal(firstStay(changed).alternatives[1].customId, secondId);
  const primaryChanged = setHotelOptionRateInState(changed, keyFor(changed), '', 'nightlyRate', 2468);
  assert.equal(firstStay(primaryChanged).nightlyRate, 2468);
  assert.deepEqual(firstStay(primaryChanged).alternatives, firstStay(changed).alternatives);
});

test('clearing a custom quote returns to an unused stable blank slot', () => {
  const named = custom(stateFor(), 0, { hotelName: 'Temporary option', nightlyRate: 2600, extraBedRate: 800, cnbRate: 350 });
  const id = firstStay(named).alternatives[0].customId;
  const cleared = custom(named, 0, { hotelName: '', nightlyRate: 0, extraBedRate: 0, cnbRate: 0 });
  assert.equal(firstStay(cleared).alternatives[0].customId, id);
  assert(isUnusedHotelOption(firstStay(cleared).alternatives[0]));
  assert.equal(hotelOptions(firstStay(cleared), 'multiple').length, 1);
});

test('unused blanks do not alter cost, confirmation or printable hotel names', () => {
  const before = confirmed(stateFor());
  const after = custom(custom(before, 0, {}), 1, {});
  const stay = firstStay(after);
  assert.equal(stay.rateConfirmed, true);
  assert.equal(stay.confirmedSignature, firstStay(before).confirmedSignature);
  assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).sellingTotal, calculateCosts(before.plan, before.hotelSelections, before.costModel).sellingTotal);
  assert.deepEqual(calculateCosts(after.plan, after.hotelSelections, after.costModel).missingHotelRates, []);
  assert.equal(hotelConfirmationSignature(after.plan, stay, after.input.mealPlan), hotelConfirmationSignature(before.plan, firstStay(before), before.input.mealPlan));
  assert.deepEqual(readiness(after), readiness(before));
  assert.deepEqual(hotelOptionNames(stay, 'multiple'), [stay.hotelName]);
  assert.equal(pdfHotelName(stay, after.input), stay.hotelName);
});

test('replacing an actual offered supplier with a blank custom slot still requires verification', () => {
  const before = confirmed(stateFor(fullDatabase));
  const after = custom(before, 0, {});
  assert.equal(firstStay(after).rateConfirmed, false);
  assert.equal(firstStay(after).confirmedSignature, undefined);
  assert(readiness(after).some((issue) => issue.startsWith(`Verify the ${firstStay(after).location}`)));
});

test('a named but unpriced custom option blocks client sharing', () => {
  const after = custom(stateFor(), 0, { hotelName: 'Awaiting supplier quote' });
  assert(!isUnusedHotelOption(firstStay(after).alternatives[0]));
  assert(readiness(after).some((issue) => issue.includes('positive room rate')));
  assert(calculateCosts(after.plan, after.hotelSelections, after.costModel).missingHotelRates.includes(firstStay(after).location));
});

test('a price without a hotel name is also incomplete rather than silently ignored', () => {
  const after = custom(stateFor(), 0, { nightlyRate: 2500 });
  assert(!isUnusedHotelOption(firstStay(after).alternatives[0]));
  assert(readiness(after).some((issue) => issue.includes('positive room rate')));
});

test('invalid custom prices are rejected without changing the quote', () => {
  const before = custom(stateFor(), 0, { hotelName: 'Valid supplier', nightlyRate: 2300 });
  for (const field of ['nightlyRate', 'extraBedRate', 'cnbRate']) {
    for (const value of [-1, NaN, Infinity]) assert.equal(custom(before, 0, { [field]: value }), before);
  }
  const stay = firstStay(before);
  const malformed = { ...before, hotelSelections: [{ ...stay, alternatives: [{ ...stay.alternatives[0], extraBedRate: -5, cnbRate: Infinity }] }, ...before.hotelSelections.slice(1)] };
  assert(readiness(malformed).some((issue) => issue.includes('non-negative extra-bed and child rates')));
});

test('a higher custom group quote replaces the charged bundle exactly once', () => {
  const before = stateFor();
  const after = custom(before, 0, { hotelName: 'Higher custom quote', nightlyRate: 3200, extraBedRate: 1200, cnbRate: 400 });
  const stay = firstStay(after);
  const quoted = effectiveHotelSelection(stay, 'multiple');
  assert.equal(quoted.hotelName, 'Higher custom quote');
  assert.deepEqual([quoted.nightlyRate, quoted.extraBedRate, quoted.cnbRate], [3200, 1200, 400]);
  const beforeCost = calculateCosts(before.plan, before.hotelSelections, before.costModel);
  const afterCost = calculateCosts(after.plan, after.hotelSelections, after.costModel);
  const difference = hotelNightNumbers(after.plan, stay).length * (hotelOptionNightlyCost(quoted, stay) - hotelOptionNightlyCost(firstStay(before), firstStay(before)));
  assert.equal(afterCost.accommodation - beforeCost.accommodation, difference);
  assert.equal(afterCost.transport, beforeCost.transport);
  assert.equal(afterCost.activities, beforeCost.activities);
  assert.deepEqual(after.hotelSelections.slice(1), before.hotelSelections.slice(1));
});

test('a lower custom quote never lowers the already quoted primary hotel amount', () => {
  const before = stateFor();
  const after = custom(before, 0, { hotelName: 'Lower custom quote', nightlyRate: 1000, extraBedRate: 100, cnbRate: 100 });
  assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).accommodation, calculateCosts(before.plan, before.hotelSelections, before.costModel).accommodation);
  assert.equal(effectiveHotelSelection(firstStay(after), 'multiple').hotelId, firstStay(before).hotelId);
});

test('PDF names include completed custom choices in price order and leave blanks out', () => {
  const after = custom(custom(stateFor(), 0, {}), 1, { hotelName: 'Premium custom option', nightlyRate: 2800, extraBedRate: 900, cnbRate: 400 });
  const stay = firstStay(after);
  assert.equal(pdfHotelName(stay, after.input), `${stay.hotelName} / Premium custom option or similar`);
  assert.equal(pdfHotelName(stay, { hotelOptionMode: 'single' }), stay.hotelName);
  assert(!pdfHotelName(stay, after.input).includes('Custom hotel'));
});

test('new inventory preserves an explicitly blank custom slot instead of auto-filling it', () => {
  const before = custom(custom(stateFor(), 0, {}), 1, { hotelName: 'Operator supplier', nightlyRate: 2300 });
  const refreshed = syncHotelSelections(before.plan, before.hotelSelections, fullDatabase, before.input);
  assert.deepEqual(refreshed[0].alternatives, firstStay(before).alternatives);
  assert.equal(refreshed[0].hotelId, firstStay(before).hotelId);
});

test('master updates cannot overwrite negotiated custom quotes', () => {
  const before = custom(stateFor(), 0, { hotelName: 'Negotiated supplier', nightlyRate: 2345, extraBedRate: 678, cnbRate: 90 });
  const changedDatabase = fullDatabase.map((record) => ({ ...record, mapB2B: 17000, name: `Updated ${record.name}` }));
  const after = syncHotelSelections(before.plan, before.hotelSelections, changedDatabase, before.input);
  assert.deepEqual(after[0].alternatives[0], firstStay(before).alternatives[0]);
  assert.equal(after[0].nightlyRate, firstStay(before).nightlyRate);
});

test('an explicit primary change retains custom alternatives including an intentionally empty slot', () => {
  const before = custom(custom(stateFor(fullDatabase), 0, { hotelName: 'Negotiated alternative', nightlyRate: 2345 }), 1, {});
  const replacement = fullDatabase.find((record) => record.destination === firstStay(before).location && record.id !== firstStay(before).hotelId);
  const after = replaceHotelInState(before, keyFor(before), replacement.id);
  assert.equal(firstStay(after).hotelId, replacement.id);
  assert.deepEqual(firstStay(after).alternatives, firstStay(before).alternatives);
  assert.deepEqual(after.hotelSelections.slice(1), before.hotelSelections.slice(1));
});

test('changing the primary within the package updates inherited custom category without losing the quote', () => {
  const base = stateFor();
  const newPrimary = master(firstStay(base).location, 'budget-primary', 2300, { normalizedCategory: 'Budget', sourceCategory: 'Budget', starRating: null });
  const before = custom(custom({ ...base, hotelDatabase: [...base.hotelDatabase, newPrimary] }, 0, { hotelName: 'Operator supplier', nightlyRate: 2400, extraBedRate: 800, cnbRate: 250 }), 1, {});
  const original = firstStay(before).alternatives;
  const after = replaceHotelInState(before, keyFor(before), newPrimary.id);
  const stay = firstStay(after);
  assert.equal(stay.category, 'Budget');
  for (const [index, option] of stay.alternatives.entries()) {
    assert.equal(option.category, 'Budget');
    assert.deepEqual({ ...option, category: original[index].category }, original[index]);
  }
  assert(!readiness(after).some((issue) => /same hotel category|Choose Signature properties/.test(issue)));
});

test('single and multiple mode toggles keep custom names, rates and empty-slot identities', () => {
  const before = custom(custom(stateFor(), 0, { hotelName: 'Negotiated supplier', nightlyRate: 2600 }), 1, {});
  const single = generatePlannerState(before, { hotelOptionMode: 'single' });
  const again = generatePlannerState(single, { hotelOptionMode: 'multiple' });
  for (const stay of again.hotelSelections) {
    const original = selected(before, hotelSelectionKey(stay));
    if (original) assert.deepEqual(stay.alternatives, original.alternatives);
  }
  assert.equal(hotelOptions(firstStay(single), 'single').length, 1);
});

test('extending and shortening the journey preserves surviving destination custom quotes', () => {
  const before = custom(custom(stateFor(), 0, { hotelName: 'Agreed supplier', nightlyRate: 2678, extraBedRate: 765, cnbRate: 234 }), 1, {});
  for (const departure of ['2026-10-25', '2026-10-21']) {
    const after = generatePlannerState(before, { departure });
    for (const stay of after.hotelSelections) {
      const original = selected(before, hotelSelectionKey(stay));
      if (original) {
        assert.equal(stay.hotelId, original.hotelId);
        assert.equal(stay.nightlyRate, original.nightlyRate);
        assert.deepEqual(stay.alternatives, original.alternatives);
      }
    }
    assert.equal(after.input.transport, before.input.transport);
    assert.equal(after.costModel.transportDaily, before.costModel.transportDaily);
  }
});

test('saved itinerary serialization and restoration retain custom identities and prices', () => {
  let before = custom(custom(stateFor(), 0, { hotelName: 'Saved custom supplier', nightlyRate: 2345, extraBedRate: 456, cnbRate: 123 }), 1, {});
  // Deliberately leave every other destination's spare choices custom too, so
  // newly available automatic inventory cannot change this saved quote.
  for (const stay of before.hotelSelections.slice(1)) {
    const key = hotelSelectionKey(stay);
    before = custom(custom(before, 0, {}, key), 1, {}, key);
  }
  const snapshot = JSON.parse(JSON.stringify(itinerarySnapshot(before)));
  const restored = reconcilePlannerState({ ...before, ...snapshot, hotelDatabase: fullDatabase });
  assert.deepEqual(firstStay(restored).alternatives, JSON.parse(JSON.stringify(firstStay(before).alternatives)));
  assert.equal(calculateCosts(restored.plan, restored.hotelSelections, restored.costModel).accommodation, calculateCosts(before.plan, before.hotelSelections, before.costModel).accommodation);
  assert.equal(pdfHotelName(firstStay(restored), restored.input), pdfHotelName(firstStay(before), before.input));
});

test('replacing a custom slot with a database hotel drops its custom identity', () => {
  const before = custom(stateFor(fullDatabase), 0, { hotelName: 'Replaced custom supplier', nightlyRate: 2600 });
  const replacement = fullDatabase.find((record) => record.destination === firstStay(before).location && record.id !== firstStay(before).hotelId && !firstStay(before).alternatives.some((option, index) => index !== 0 && option.hotelId === record.id));
  const after = replaceHotelAlternativeInState(before, keyFor(before), 0, replacement.id);
  assert.equal(firstStay(after).alternatives[0].hotelId, replacement.id);
  assert.equal(firstStay(after).alternatives[0].customId, undefined);
  assert.equal(hotelOptionIdentity(firstStay(after).alternatives[0]), replacement.id);
});

test('converting a database choice to custom starts a genuine blank quote', () => {
  const before = stateFor(fullDatabase);
  assert(firstStay(before).alternatives[0].hotelId);
  const after = custom(before, 0, {});
  const option = firstStay(after).alternatives[0];
  assert.equal(option.hotelName, '');
  assert.equal(option.hotelId, '');
  assert.deepEqual([option.nightlyRate, option.extraBedRate, option.cnbRate], [0, 0, 0]);
  assert(option.customId);
  assert(isUnusedHotelOption(option));
  assert.deepEqual(firstStay(after).alternatives[1], firstStay(before).alternatives[1]);
});

test('duplicate custom names cannot be shared as three different properties', () => {
  const after = custom(custom(stateFor(), 0, { hotelName: 'Same custom supplier', nightlyRate: 2200 }), 1, { hotelName: '  SAME CUSTOM SUPPLIER  ', nightlyRate: 2300 });
  assert.notEqual(firstStay(after).alternatives[0].customId, firstStay(after).alternatives[1].customId);
  assert(readiness(after).some((issue) => /different properties|duplicate|distinct/i.test(issue)));
});

test('a custom alternative duplicating the primary name must be corrected before sharing', () => {
  const before = stateFor();
  const after = custom(before, 0, { hotelName: ` ${firstStay(before).hotelName.toUpperCase()} `, nightlyRate: 2300 });
  assert(readiness(after).some((issue) => /different properties|duplicate|distinct/i.test(issue)));
});

test('duplicate custom names keep their exact slots and quoted values through synchronization', () => {
  const before = custom(custom(stateFor(), 0, { hotelName: 'Same custom supplier', nightlyRate: 2200 }), 1, { hotelName: ' SAME CUSTOM SUPPLIER ', nightlyRate: 2300 });
  const synced = syncHotelSelections(before.plan, before.hotelSelections, fullDatabase, before.input);
  assert.deepEqual(synced[0].alternatives, firstStay(before).alternatives);
  const after = { ...before, hotelSelections: synced, hotelDatabase: fullDatabase };
  assert(readiness(after).some((issue) => /different properties|duplicate|distinct/i.test(issue)));
  const corrected = custom(after, 1, { hotelName: 'Corrected second supplier' });
  assert.equal(firstStay(corrected).alternatives[0].customId, firstStay(before).alternatives[0].customId);
  assert.equal(firstStay(corrected).alternatives[1].customId, firstStay(before).alternatives[1].customId);
  assert.equal(firstStay(corrected).alternatives[1].nightlyRate, 2300);
  assert(!readiness(corrected).some((issue) => /different properties|duplicate|distinct/i.test(issue)));
});

test('temporarily matching the primary name does not erase a custom option during synchronization', () => {
  const base = stateFor();
  const before = custom(custom(base, 0, { hotelName: firstStay(base).hotelName, nightlyRate: 2200 }), 1, { hotelName: 'Other custom supplier', nightlyRate: 2300 });
  const synced = syncHotelSelections(before.plan, before.hotelSelections, fullDatabase, before.input);
  assert.deepEqual(synced[0].alternatives, firstStay(before).alternatives);
  const after = { ...before, hotelSelections: synced, hotelDatabase: fullDatabase };
  assert(readiness(after).some((issue) => /different properties|duplicate|distinct/i.test(issue)));
});

test('custom alternatives survive while the primary has no database match and when inventory later arrives', () => {
  const base = stateFor([]);
  assert.equal(firstStay(base).hotelId, '');
  const before = custom(base, 1, { hotelName: 'Only available supplier', nightlyRate: 2400 });
  const emptySync = syncHotelSelections(before.plan, before.hotelSelections, [], before.input);
  assert.deepEqual(emptySync[0].alternatives, firstStay(before).alternatives);
  const populated = syncHotelSelections(before.plan, emptySync, fullDatabase, before.input);
  assert(populated[0].hotelId);
  for (const [index, option] of populated[0].alternatives.entries()) {
    assert.equal(option.category, populated[0].category);
    assert.deepEqual({ ...option, category: firstStay(before).alternatives[index].category }, firstStay(before).alternatives[index]);
  }
  const after = { ...before, hotelSelections: populated, hotelDatabase: fullDatabase };
  assert(!readiness(after).some((issue) => /same hotel category|Choose Signature properties/.test(issue)));
});

test('custom slot updates are isolated to their destination and reject invalid indices', () => {
  const before = stateFor();
  const after = custom(before, 0, { hotelName: 'Only this destination', nightlyRate: 2400 });
  assert.deepEqual(after.hotelSelections.slice(1), before.hotelSelections.slice(1));
  assert.equal(setCustomHotelAlternativeInState(before, 'Unknown destination', 0, {}), before);
  for (const index of [-1, 2, 0.5]) assert.equal(custom(before, index, {}), before);
  const wrongDestination = fullDatabase.find((record) => record.destination !== firstStay(before).location);
  assert.equal(replaceHotelAlternativeInState(after, keyFor(after), 0, wrongDestination.id), after);
});

test('custom hotel options remain dormant in single-hotel mode', () => {
  const before = stateFor();
  const single = generatePlannerState(before, { hotelOptionMode: 'single' });
  assert.equal(custom(single, 0, { hotelName: 'Unexpected option', nightlyRate: 5000 }), single);
});

test('Srinagar houseboat custom options stay separate from hotel quotes and overnight allocation', () => {
  const database = [...sparseDatabase, master('Srinagar', 'boat-main', 3000, { name: 'Lake Main Houseboat' })];
  const base = stateFor(database);
  const night = base.plan.dayPlans.slice(0, base.plan.nights).find((day) => day.stay === 'Srinagar').day;
  const before = setSrinagarHouseboatNights(base, [night]);
  const boat = before.hotelSelections.find((hotel) => hotelStayType(hotel) === 'houseboat');
  const hotel = before.hotelSelections.find((hotel) => hotel.location === 'Srinagar' && hotelStayType(hotel) === 'hotel');
  const key = hotelSelectionKey(boat);
  const after = custom(custom(before, 0, { hotelName: 'Private Lake Houseboat', nightlyRate: 3800, extraBedRate: 900, cnbRate: 400 }, key), 1, {}, key);
  const boatAfter = selected(after, key);
  assert.equal(boatAfter.alternatives[0].hotelId, '');
  assert(isUnusedHotelOption(boatAfter.alternatives[1]));
  assert.deepEqual(selected(after, hotelSelectionKey(hotel)), hotel);
  assert.deepEqual(boatAfter.nightNumbers, boat.nightNumbers);
  assert.equal(boatAfter.nights, 1);
  assert.equal(pdfHotelName(boatAfter, after.input), 'Lake Main Houseboat / Private Lake Houseboat or similar');
  assert(!readiness(after).some((issue) => /Select a (hotel|houseboat) property/.test(issue)));
  const assigned = after.hotelSelections.filter((stay) => stay.location === 'Srinagar').flatMap((stay) => hotelNightNumbers(after.plan, stay));
  assert.equal(new Set(assigned).size, assigned.length);
  const expected = after.hotelSelections.reduce((sum, stay) => sum + hotelNightNumbers(after.plan, stay).length * hotelOptionNightlyCost(effectiveHotelSelection(stay, 'multiple'), stay), 0);
  assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).accommodation, expected);
});

if (failures.length) { process.stderr.write(`${failures.length} custom-hotel-option checks failed.\n`); process.exitCode = 1; }
else process.stdout.write(`${checks} custom-hotel-option checks passed.\n`);
