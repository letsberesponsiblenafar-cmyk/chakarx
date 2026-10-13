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
const { syncHotelSelections, generatePlannerState, setSrinagarHouseboatNights, replaceHotelInState, replaceHotelAlternativeInState, setHotelOptionRateInState, itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { hotelOptions, hotelOptionNames, effectiveHotelSelection, hotelAlternativeCandidates, hotelOptionNightlyCost } = require('../lib/hotel-options.ts');
const { hotelSelectionKey, hotelStayType, hotelNightNumbers } = require('../lib/accommodation.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { hotelConfirmationSignature, quoteReadiness, planInputsNeedRefresh } = require('../lib/quote-readiness.ts');

const input = { name: 'Hotel options regression', arrival: '2026-10-18', departure: '2026-10-23', arrivalTime: '08:00', departureTime: '18:00', pickup: 'Srinagar', adults: 4, youngAges: [3, 8], budget: 60000, hotelCategory: 'Signature', mealPlan: 'Breakfast & Dinner', transport: 'Sedan', style: 'Balanced', interests: ['Nature'], hotelOptionMode: 'multiple' };
function master(location, suffix = 'main', rate = 2000, overrides = {}) {
  return { id: `${location}-${suffix}`, destination: location, name: `${location} ${suffix} Hotel`, sourceCategory: '3 Star', normalizedCategory: '3 Star', starRating: 3, address: `${location} address`, roomType: 'Deluxe room', website: '', mapB2B: rate, extraBedB2B: 700, cnbB2B: 300, sourceType: 'Imported master', rateValidity: '2026-10-01 to 2026-11-30', availabilityStatus: 'Available', lastUpdated: '2026-10-12', sourceFiles: [], notes: '', ...overrides };
}
const destinations = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri', 'Naranag'];
const database = destinations.flatMap((location) => [master(location), master(location, 'near-low', 1900), master(location, 'near-high', 2200), master(location, 'near-other', 2400)]);
function stateFor(mode = 'multiple', db = database) {
  const brief = { ...input, hotelOptionMode: mode };
  const plan = createPlan(brief);
  const hotels = syncHotelSelections(plan, [], db, brief);
  return { input: brief, plan, routeVersion: 'fixture', hotelSelections: hotels, hotelDatabase: db, costModel: { transportDaily: 4321, transportIsCustom: true, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {}, activitySelections: {}, manualInclusions: ['Welcome assistance'], manualExclusions: ['Flights'], contingencyPct: 0, profitPct: 10, otherAmount: 123 }, hotelDefaults: { rooms: 2, extraBeds: 1, cnb: 1, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }, generated: true, savedItineraryId: 'existing-quote' };
}
function readiness(state) { return quoteReadiness(state.plan, state.input, state.hotelSelections, state.costModel, state.hotelDatabase, 'ready', 'ready'); }
let checks = 0;
const failures = [];
function test(name, run) { try { run(); checks++; process.stdout.write(`PASS ${name}\n`); } catch (error) { failures.push(error); process.stderr.write(`FAIL ${name}: ${error.stack}\n`); } }
const state = stateFor();
const hotel = state.hotelSelections[0];
const key = hotelSelectionKey(hotel);

test('multiple mode offers primary and at most two compatible alternatives', () => {
  for (const selected of state.hotelSelections) {
    assert.equal(selected.alternatives.length, 2);
    const options = hotelOptions(selected, 'multiple');
    assert.equal(options.length, 3);
    assert(options.every((option) => option.category === selected.category));
    assert.equal(new Set(options.map((option) => option.hotelId)).size, 3);
  }
});
test('single mode retains exactly the existing single-property calculation', () => {
  const single = stateFor('single');
  assert(single.hotelSelections.every((selected) => !selected.alternatives));
  const expected = single.hotelSelections.reduce((total, selected) => total + selected.nights * hotelOptionNightlyCost(selected, selected), 0);
  assert.equal(calculateCosts(single.plan, single.hotelSelections, single.costModel).accommodation, expected);
});
test('cost uses just the highest complete group-rate bundle', () => {
  const quoted = { ...hotel, rooms: 2, extraBeds: 1, cnb: 1, nightlyRate: 2000, extraBedRate: 100, cnbRate: 100, alternatives: [
    { ...hotel, hotelId: 'higher-room', hotelName: 'Higher room rate', nightlyRate: 2500, extraBedRate: 0, cnbRate: 0 },
    { ...hotel, hotelId: 'higher-bundle', hotelName: 'Higher group total', nightlyRate: 2100, extraBedRate: 1000, cnbRate: 50 },
  ] };
  const effective = effectiveHotelSelection(quoted, 'multiple');
  assert.equal(effective.hotelId, 'higher-bundle');
  assert.deepEqual([effective.nightlyRate, effective.extraBedRate, effective.cnbRate], [2100, 1000, 50]);
  const expected = quoted.nights * 5250;
  assert.equal(calculateCosts(state.plan, [quoted], state.costModel).accommodation, expected);
  assert.equal(effective.rooms, quoted.rooms);
  assert.equal(effective.nights, quoted.nights);
});
test('changing occupancy recalculates which full quote is highest', () => {
  const quoted = { ...hotel, rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 2500, extraBedRate: 0, alternatives: [{ ...hotel, hotelId: 'extra', hotelName: 'Extra bed option', nightlyRate: 2000, extraBedRate: 1000 }] };
  assert.equal(effectiveHotelSelection(quoted, 'multiple').hotelId, hotel.hotelId);
  assert.equal(effectiveHotelSelection({ ...quoted, extraBeds: 1 }, 'multiple').hotelId, 'extra');
});
test('display names use increasing group price and ignore cached options in single mode', () => {
  const options = hotelOptions(hotel, 'multiple');
  assert.deepEqual(hotelOptionNames(hotel, 'multiple'), options.map((option) => option.hotelName));
  assert.deepEqual(hotelOptionNames(hotel, 'single'), [hotel.hotelName]);
  assert(options.every((option, index) => !index || hotelOptionNightlyCost(options[index - 1], hotel) <= hotelOptionNightlyCost(option, hotel)));
});
test('duplicate IDs and duplicate names cannot inflate option list', () => {
  const duplicate = { ...hotel, alternatives: [{ ...hotel, hotelId: 'different-id', hotelName: ` ${hotel.hotelName.toUpperCase()} ` }, { ...hotel, hotelName: 'Different name' }] };
  assert.equal(hotelOptions(duplicate, 'multiple').length, 1);
});
test('automatic pool excludes other destinations, categories, expensive rates and invalid inventory', () => {
  const primary = { ...hotel, nightlyRate: 2000, category: '3 Star', hotelId: `${hotel.location}-main` };
  const candidates = [master(primary.location, 'good', 2100), master(primary.location, 'wrong-category', 2200, { normalizedCategory: '4 Star' }), master(primary.location, 'budget', 2200, { normalizedCategory: 'Budget' }), master(primary.location, 'expensive', 2700), master(primary.location, 'too-cheap', 1200), master(primary.location, 'no-rate', 0), master(primary.location, 'expired', 2100, { rateValidity: '2025-10-01 to 2025-10-31' }), master(primary.location, 'closed', 2100, { availabilityStatus: 'Sold out' }), master(primary.location, 'boat', 2100, { name: 'Lake Houseboat' }), master('Wrong destination', 'wrong-location', 2100)];
  assert.deepEqual(hotelAlternativeCandidates(primary, candidates, 'Signature', '2026-10-18', '2026-10-20').map((record) => record.id), [`${primary.location}-good`]);
});
test('date-valid rates precede unverified rates without excluding unverified inventory', () => {
  const primary = { ...hotel, nightlyRate: 2000, category: '3 Star', hotelId: 'manual' };
  const candidates = [master(primary.location, 'unverified', 2010, { rateValidity: '' }), master(primary.location, 'matching', 2200)];
  assert.equal(hotelAlternativeCandidates(primary, candidates, 'Signature', '2026-10-18', '2026-10-20')[0].id, `${primary.location}-matching`);
});
test('scarce inventory never invents three hotels or crosses categories', () => {
  const sparse = stateFor('multiple', destinations.map((location) => master(location)));
  for (const selected of sparse.hotelSelections) assert.equal(hotelOptions(selected, 'multiple').length, 1);
});
test('master refresh preserves primary and every selected alternative quote', () => {
  const changed = database.map((record) => ({ ...record, name: `Renamed ${record.name}`, mapB2B: record.mapB2B + 10000 }));
  assert.deepEqual(syncHotelSelections(state.plan, state.hotelSelections, changed, state.input), state.hotelSelections);
});
test('new inventory fills empty option slots without replacing an already offered option', () => {
  const sparse = stateFor('multiple', destinations.flatMap((location) => [master(location), master(location, 'near-low', 1900)]));
  const refreshed = syncHotelSelections(sparse.plan, sparse.hotelSelections, database, sparse.input);
  for (const selected of refreshed) {
    const before = sparse.hotelSelections.find((item) => item.location === selected.location);
    assert.deepEqual(selected.alternatives[0], before.alternatives[0]);
    assert.equal(selected.alternatives.length, 2);
  }
});
test('single / multiple toggles retain cached choices and negotiated rates', () => {
  const single = generatePlannerState(state, { hotelOptionMode: 'single' });
  const again = generatePlannerState(single, { hotelOptionMode: 'multiple' });
  for (const selected of again.hotelSelections) {
    const original = state.hotelSelections.find((item) => item.location === selected.location);
    assert.equal(selected.hotelId, original.hotelId);
    assert.deepEqual(selected.alternatives, original.alternatives);
  }
  assert.equal(calculateCosts(single.plan, single.hotelSelections, single.costModel).accommodation, single.hotelSelections.reduce((sum, selected) => sum + selected.nights * hotelOptionNightlyCost(selected, selected), 0));
});
test('snapshot round trip preserves all options and their prices', () => {
  const snapshot = JSON.parse(JSON.stringify(itinerarySnapshot(state)));
  assert.deepEqual(snapshot.hotelSelections, JSON.parse(JSON.stringify(state.hotelSelections)));
  assert.equal(snapshot.input.hotelOptionMode, 'multiple');
  assert.equal(calculateCosts(snapshot.plan, snapshot.hotelSelections, snapshot.costModel).accommodation, calculateCosts(state.plan, state.hotelSelections, state.costModel).accommodation);
});
test('a longer trip replans while keeping chosen options and vehicle price', () => {
  const longer = generatePlannerState(state, { departure: '2026-10-25' });
  assert.equal(longer.plan.nights, 7);
  assert.equal(longer.costModel.transportDaily, state.costModel.transportDaily);
  for (const selected of longer.hotelSelections) {
    const original = state.hotelSelections.find((item) => item.location === selected.location);
    if (original) {
      assert.equal(selected.hotelId, original.hotelId);
      assert.equal(selected.nightlyRate, original.nightlyRate);
      assert.deepEqual(selected.alternatives, original.alternatives);
    }
  }
});
test('a shorter trip preserves quoted rates on all remaining destinations', () => {
  const shorter = generatePlannerState(state, { departure: '2026-10-21' });
  for (const selected of shorter.hotelSelections) {
    const original = state.hotelSelections.find((item) => item.location === selected.location);
    if (original) assert.deepEqual(selected.alternatives, original.alternatives);
  }
});
test('editing an option changes that supplier alone and invalidates confirmation', () => {
  const target = hotel.alternatives[0];
  const changed = setHotelOptionRateInState(state, key, target.hotelId, 'nightlyRate', 2317);
  const selected = changed.hotelSelections.find((item) => hotelSelectionKey(item) === key);
  assert.equal(selected.nightlyRate, hotel.nightlyRate);
  assert.equal(selected.alternatives[0].nightlyRate, 2317);
  assert.deepEqual(selected.alternatives[1], hotel.alternatives[1]);
  assert.equal(selected.rateConfirmed, false);
  assert.equal(selected.confirmedSignature, undefined);
});
test('custom primary with blank ID can be priced without updating alternatives', () => {
  const customState = { ...state, hotelSelections: [{ ...hotel, hotelId: '', hotelName: 'Custom stay' }] };
  const changed = setHotelOptionRateInState(customState, key, '', 'nightlyRate', 2468);
  assert.equal(changed.hotelSelections[0].nightlyRate, 2468);
  assert.deepEqual(changed.hotelSelections[0].alternatives, hotel.alternatives);
});
test('replacing an alternative preserves primary rooms and all other quoted fields', () => {
  const replacement = database.find((record) => record.destination === hotel.location && ![hotel.hotelId, ...hotel.alternatives.map((option) => option.hotelId)].includes(record.id));
  const changed = replaceHotelAlternativeInState(state, key, 0, replacement.id);
  const selected = changed.hotelSelections.find((item) => hotelSelectionKey(item) === key);
  assert.equal(selected.alternatives[0].hotelId, replacement.id);
  assert.deepEqual({ ...selected, alternatives: hotel.alternatives, rateConfirmed: hotel.rateConfirmed, confirmedSignature: hotel.confirmedSignature }, { ...hotel, confirmedSignature: undefined });
});
test('duplicate, wrong-category and out-of-range alternative replacements are rejected', () => {
  const bad = master(hotel.location, 'outside', 99999);
  const withBad = { ...state, hotelDatabase: [...database, bad] };
  assert.equal(replaceHotelAlternativeInState(state, key, 0, hotel.hotelId), state);
  assert.equal(replaceHotelAlternativeInState(state, key, 0, hotel.alternatives[1].hotelId), state);
  assert.equal(replaceHotelAlternativeInState(withBad, key, 0, bad.id), withBad);
});
test('a legacy package-band category resolves from its primary master record', () => {
  const legacy = { ...hotel, category: 'Signature' };
  assert(hotelAlternativeCandidates(legacy, database, 'Signature', input.arrival, input.departure).length > 0);
});
test('custom hotel with a package-band category can receive matching package options', () => {
  const custom = { ...hotel, hotelId: '', hotelName: 'Manually quoted hotel', category: 'Signature' };
  assert(hotelAlternativeCandidates(custom, database, 'Signature', input.arrival, input.departure).length > 0);
});
test('an explicitly chosen custom placeholder does not become an automatic hotel again', () => {
  const placeholder = { ...hotel, hotelId: '', hotelName: 'Hotel to be added', source: 'Custom hotel', nightlyRate: 0, alternatives: [] };
  const synced = syncHotelSelections(state.plan, [placeholder, ...state.hotelSelections.slice(1)], database, state.input);
  assert.equal(synced[0].hotelId, '');
  assert.equal(synced[0].hotelName, 'Hotel to be added');
  assert.equal(synced[0].nightlyRate, 0);
});
test('an alternative displayed by derived state can immediately be edited in raw state', () => {
  const custom = { ...hotel, hotelId: '', hotelName: 'New custom hotel', category: 'Signature', nightlyRate: 2000, alternatives: undefined };
  const raw = { ...state, hotelSelections: [custom, ...state.hotelSelections.slice(1)] };
  const derived = syncHotelSelections(state.plan, raw.hotelSelections, database, state.input)[0];
  assert.equal(derived.alternatives.length, 2);
  const changed = setHotelOptionRateInState(raw, key, derived.alternatives[1].hotelId, 'nightlyRate', 2255);
  assert.equal(changed.hotelSelections[0].alternatives[1].nightlyRate, 2255);
  const another = database.find((record) => record.destination === hotel.location && !derived.alternatives.some((option) => option.hotelId === record.id));
  const replaced = replaceHotelAlternativeInState(raw, key, 1, another.id);
  assert.equal(replaced.hotelSelections[0].alternatives[1].hotelId, another.id);
});
test('an explicit primary change refreshes incompatible options while preserving other stays', () => {
  const higher = master(hotel.location, 'new-primary', 5000);
  const companion = master(hotel.location, 'new-companion', 5200);
  const fixture = { ...state, hotelDatabase: [...database, higher, companion] };
  const changed = replaceHotelInState(fixture, key, higher.id);
  const selected = changed.hotelSelections.find((item) => hotelSelectionKey(item) === key);
  assert.equal(selected.hotelId, higher.id);
  assert.deepEqual(selected.alternatives.map((option) => option.hotelId), [companion.id]);
  assert.equal(selected.rooms, hotel.rooms);
  assert.deepEqual(changed.hotelSelections.slice(1), state.hotelSelections.slice(1));
});
test('every offered supplier is included in the verification signature', () => {
  const signature = hotelConfirmationSignature(state.plan, hotel, input.mealPlan);
  const changed = { ...hotel, alternatives: hotel.alternatives.map((option, index) => index ? option : { ...option, extraBedRate: option.extraBedRate + 1 }) };
  assert.notEqual(hotelConfirmationSignature(state.plan, changed, input.mealPlan), signature);
});
test('an invalid unpriced alternative blocks sharing even when another option is expensive', () => {
  const changed = { ...state, hotelSelections: [{ ...hotel, alternatives: [{ ...hotel.alternatives[0], nightlyRate: 0 }] }] };
  assert(readiness(changed).some((issue) => issue.includes('positive room rate')));
});
test('a missing alternative master record is reported rather than silently replaced', () => {
  const changed = { ...state, hotelDatabase: database.filter((record) => record.id !== hotel.alternatives[0].hotelId) };
  assert(readiness(changed).some((issue) => issue.includes('master record is unavailable')));
  assert.deepEqual(syncHotelSelections(state.plan, state.hotelSelections, changed.hotelDatabase, state.input), state.hotelSelections);
});
test('legacy input without mode is single; changing mode requires Next', () => {
  const legacy = { ...state.plan, input: { ...state.plan.input, hotelOptionMode: undefined } };
  assert.equal(planInputsNeedRefresh(legacy, { ...input, hotelOptionMode: 'single' }), false);
  assert.equal(planInputsNeedRefresh(legacy, input), true);
});
test('a lower-priced option with expired supplier dates can be reviewed without changing the highest quote', () => {
  const lower = hotelOptions(hotel, 'multiple')[0];
  const changed = { ...state, hotelDatabase: state.hotelDatabase.map((record) => record.id === lower.hotelId ? { ...record, rateValidity: 'October 2025' } : record) };
  assert(readiness(changed).some((issue) => issue.includes(lower.hotelName) && issue.includes('outside')));
  const total = calculateCosts(changed.plan, changed.hotelSelections, changed.costModel).sellingTotal;
  const reviewed = setHotelOptionRateInState(changed, key, lower.hotelId, 'nightlyRate', lower.nightlyRate);
  assert(!readiness(reviewed).some((issue) => issue.includes(lower.hotelName) && issue.includes('outside')));
  assert.equal(calculateCosts(reviewed.plan, reviewed.hotelSelections, reviewed.costModel).sellingTotal, total);
  assert.equal(reviewed.hotelSelections[0].rateConfirmed, false);
});
test('houseboat alternatives remain separate and never double-charge Srinagar nights', () => {
  const boats = ['main', 'second', 'third'].map((suffix, index) => master('Srinagar', `boat-${suffix}`, 3000 + index * 200, { name: `Lake ${suffix} Houseboat` }));
  const base = stateFor('multiple', [...database, ...boats]);
  const night = base.plan.dayPlans.slice(0, base.plan.nights).find((day) => day.stay === 'Srinagar').day;
  const withBoat = setSrinagarHouseboatNights(base, [night]);
  const boat = withBoat.hotelSelections.find((item) => hotelStayType(item) === 'houseboat');
  assert.equal(hotelOptions(boat, 'multiple').length, 3);
  assert(hotelOptions(boat, 'multiple').every((option) => /houseboat/i.test(option.hotelName)));
  const sr = withBoat.hotelSelections.filter((item) => item.location === 'Srinagar');
  const allocated = sr.flatMap((item) => hotelNightNumbers(withBoat.plan, item));
  assert.equal(allocated.length, new Set(allocated).size);
  assert.equal(sr.reduce((sum, item) => sum + item.nights, 0), base.plan.hotelPlans.find((item) => item.location === 'Srinagar').nights);
  const expected = withBoat.hotelSelections.reduce((sum, item) => sum + hotelNightNumbers(withBoat.plan, item).length * hotelOptionNightlyCost(effectiveHotelSelection(item, 'multiple'), item), 0);
  assert.equal(calculateCosts(withBoat.plan, withBoat.hotelSelections, withBoat.costModel).accommodation, expected);
});

test('manual package bands work with legacy matching alternatives without supplier stars overriding them', () => {
  const mixed = destinations.flatMap((location) => [
    master(location, 'manual', 1800, { normalizedCategory: 'Signature', sourceCategory: '5 Star', starRating: 5 }),
    master(location, 'legacy', 1900),
    master(location, 'other-manual', 2000, { normalizedCategory: 'Signature', sourceCategory: '4 Star', starRating: 4 }),
    master(location, 'wrong-band', 1850, { normalizedCategory: 'Elite', sourceCategory: '3 Star' }),
  ]);
  const manual = stateFor('multiple', mixed);
  for (const stay of manual.hotelSelections) {
    assert(stay.hotelId.endsWith('-manual'));
    assert.equal(stay.alternatives.length, 2);
    assert(stay.alternatives.some((option) => option.hotelId.endsWith('-legacy')));
    assert(!stay.alternatives.some((option) => option.hotelId.endsWith('-wrong-band')));
  }
  assert(!readiness(manual).some((issue) => /same hotel category|Choose Signature properties/.test(issue)));
});

test('a manually classified alternative matches a legacy primary by package band', () => {
  const mixed = destinations.flatMap((location) => [master(location),
    master(location, 'manual-alt', 2100, { normalizedCategory: 'Signature', sourceCategory: '5 Star', starRating: 5 }),
  ]);
  const legacy = stateFor('multiple', mixed);
  assert(legacy.hotelSelections.every((stay) => stay.alternatives[0].hotelId.endsWith('-manual-alt')));
  assert(!readiness(legacy).some((issue) => /same hotel category|Choose Signature properties/.test(issue)));
});

test('alternative readiness follows current manual classification rather than its cached supplier class', () => {
  const current = stateFor();
  const stay = current.hotelSelections[0];
  const alternative = stay.alternatives[0];
  const stale = { ...current, hotelSelections: current.hotelSelections.map((item) => item === stay
    ? { ...item, alternatives: item.alternatives.map((option) => option === alternative ? { ...option, category: '4 Star' } : option) } : item),
    hotelDatabase: current.hotelDatabase.map((record) => record.id === alternative.hotelId ? { ...record, normalizedCategory: 'Signature' } : record) };
  assert(!readiness(stale).some((issue) => /same hotel category|Choose Signature properties/.test(issue)));
  const changed = { ...stale, hotelDatabase: stale.hotelDatabase.map((record) => record.id === alternative.hotelId ? { ...record, normalizedCategory: 'Elite' } : record) };
  assert(readiness(changed).some((issue) => /Choose Signature properties/.test(issue)));
});

if (failures.length) { process.stderr.write(`${failures.length} hotel-option checks failed.\n`); process.exitCode = 1; }
else process.stdout.write(`${checks} hotel-option checks passed.\n`);
