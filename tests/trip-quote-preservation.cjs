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

const { destinations, replaceDestinationCatalog } = require('../lib/data.ts');
const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip } = require('../lib/itinerary.ts');
const { generatePlannerState, applyPlanEdit, reconcilePlannerState, syncHotelSelections, itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { calculateCosts } = require('../lib/costing.ts');
const { hotelConfirmationSignature } = require('../lib/quote-readiness.ts');
const { removeTripDay } = require('../lib/trip-edits.ts');
const { dayScheduleContext } = require('../lib/day-scheduler.ts');
const { dayNarrative } = require('../lib/narrative.ts');

const originalCatalog = [...destinations];
const core = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg'];
const activityName = (destination) => `${destination} arranged experience`;
const activityKey = (destination) => `${destination}\u001f${activityName(destination)}`;
const dateAfter = (offset) => new Date(Date.UTC(2026, 9, 12 + offset)).toISOString().slice(0, 10);
const input = { name: 'Preserved client quote', arrival: dateAfter(0), departure: dateAfter(6), arrivalTime: '08:00',
  departureTime: '18:30', pickup: 'Srinagar', adults: 4, youngAges: [4, 8], budget: 60000,
  hotelCategory: 'Signature', mealPlan: 'Breakfast & Dinner', transport: 'Sedan', style: 'Balanced', interests: ['Nature'] };
const baseSequence = ['Srinagar', 'Gulmarg', 'Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar'];
const hotelDefaults = { rooms: 3, extraBeds: 2, cnb: 1, nightlyRate: 1234, extraBedRate: 456, cnbRate: 78 };

function masterHotel(destination, overrides = {}) {
  return { id: `master-${destination}`, destination, name: `${destination} database hotel`, sourceCategory: '3 Star',
    normalizedCategory: '3 Star', mapB2B: 3600, extraBedB2B: 800, cnbB2B: 300, starRating: 3,
    address: `${destination} address`, roomType: 'Master room', website: '', sourceType: 'Imported master',
    rateValidity: '', availabilityStatus: 'Available', lastUpdated: '2026-10-12', sourceFiles: [], notes: '', ...overrides };
}
const database = core.map((destination) => masterHotel(destination));

function selectedHotel(destination, nights, overrides = {}) {
  return { location: destination, hotelId: `master-${destination}`, hotelName: `${destination} agreed client hotel`,
    category: 'Signature', starRating: 4, address: 'Agreed address', roomType: 'Two premium rooms', website: 'https://example.com',
    nights, rooms: 2, extraBeds: 1, cnb: 1, nightlyRate: { Srinagar: 1200, Gulmarg: 3000, Pahalgam: 4000, Sonamarg: 5000 }[destination],
    extraBedRate: 600, cnbRate: 250, source: 'Negotiated client quote', status: 'Available', rateConfirmed: true, ...overrides };
}

function planFor(sequence) {
  const brief = { ...input, departure: dateAfter(sequence.length) };
  let plan = rebuildPlanFromNightSequence(createPlan(brief), sequence);
  // Operator choices must survive unchanged-duration edits. A changed trip
  // length deliberately replaces these choices with fresh recommendations.
  for (let day = 1; day <= plan.nights; day++) plan = setPlanDayTrip(plan, day, null);
  return plan;
}

function stateFor(sequence = baseSequence, overrides = {}) {
  const plan = planFor(sequence);
  const hotelSelections = plan.hotelPlans.map((stay) => selectedHotel(stay.location, stay.nights));
  for (const hotel of hotelSelections) hotel.confirmedSignature = hotelConfirmationSignature(plan, hotel, plan.input.mealPlan);
  const active = new Set(sequence);
  const activityCosts = Object.fromEntries(core.filter((destination) => active.has(destination)).map((destination, index) => [activityKey(destination), 1000 + index * 500]));
  const activitySelections = Object.fromEntries(Object.keys(activityCosts).map((key) => [key, true]));
  return { input: plan.input, plan, routeVersion: 'current-fixture', hotelSelections, hotelDatabase: database,
    costModel: { transportDaily: 6175, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 987,
      activityCosts, activitySelections, manualInclusions: ['Private family assistance'], manualExclusions: ['Airfare'],
      contingencyPct: 4, profitPct: 17.5, otherAmount: 900 },
    hotelDefaults: { ...hotelDefaults }, generated: true, savedItineraryId: 'saved-existing-client', ...overrides };
}

function hotelAgreement(hotel) {
  const { nights, rateConfirmed, confirmedSignature, ...agreement } = hotel;
  return agreement;
}
function assertRetainedHotels(before, after, locations = before.hotelSelections.map((hotel) => hotel.location)) {
  for (const location of locations) {
    const original = before.hotelSelections.find((hotel) => hotel.location === location);
    const retained = after.hotelSelections.find((hotel) => hotel.location === location);
    assert.ok(retained, `${location} selected hotel disappeared`);
    assert.deepEqual(hotelAgreement(retained), hotelAgreement(original), `${location} agreed hotel, rates or room setup changed`);
    assert.equal(retained.nights, after.plan.hotelPlans.find((stay) => stay.location === location).nights, `${location} billed nights diverged from route`);
  }
}
function assertOtherAgreements(before, after) {
  assert.equal(after.input.transport, before.input.transport, 'Selected vehicle changed');
  assert.equal(after.plan.input.transport, before.plan.input.transport, 'Plan vehicle changed');
  assert.equal(after.costModel.transportDaily, before.costModel.transportDaily, 'Agreed daily vehicle rate changed');
  assert.equal(after.costModel.transportIsCustom, before.costModel.transportIsCustom);
  assert.equal(after.costModel.profitPct, before.costModel.profitPct);
  assert.equal(after.costModel.otherAmount, before.costModel.otherAmount);
  assert.deepEqual(after.costModel.manualInclusions, before.costModel.manualInclusions);
  assert.deepEqual(after.costModel.manualExclusions, before.costModel.manualExclusions);
  assert.deepEqual(after.hotelDefaults, before.hotelDefaults, 'Common room policy changed');
  assert.equal(after.savedItineraryId, before.savedItineraryId, 'Editing the duration detached the saved client');
}
function nightCost(hotel) { return hotel.rooms * hotel.nightlyRate + hotel.extraBeds * hotel.extraBedRate + hotel.cnb * hotel.cnbRate; }
function routeChoices(plan) { return plan.dayPlans.map((day) => [day.from, day.to, day.stay, day.dayTripDestination || null, day.label]); }
function survivingHotelLocations(before, after) {
  return before.hotelSelections.filter((hotel) => after.plan.hotelPlans.some((stay) => stay.location === hotel.location)).map((hotel) => hotel.location);
}
function assertFreshRoute(after) {
  const recommended = createPlan(after.input);
  assert.deepEqual(routeChoices(after.plan), routeChoices(recommended), 'The revised duration must use the complete freshly recommended journey');
  assert.equal(after.plan.nights, recommended.nights);
  assert.equal(after.plan.days, recommended.days);
  assert.deepEqual(after.plan.hotelPlans.map((stay) => [stay.location, stay.nights]), recommended.hotelPlans.map((stay) => [stay.location, stay.nights]));
}
function assertActivityQuoteRetained(before, after) {
  const remaining = new Set(after.plan.dayPlans.flatMap((day) => [day.from, day.to, day.stay, day.dayTripDestination]).filter(Boolean));
  for (const field of ['activityCosts', 'activitySelections']) {
    const expected = Object.fromEntries(Object.entries(before.costModel[field]).filter(([key]) => remaining.has(key.split('\u001f')[0])));
    assert.deepEqual(after.costModel[field], expected, `${field} must retain exactly the destinations still represented in the replanned journey`);
  }
}
function assertCostQuantities(state) {
  const cost = calculateCosts(state.plan, state.hotelSelections, state.costModel);
  const expectedAccommodation = state.plan.hotelPlans.reduce((sum, stay) => {
    const hotel = state.hotelSelections.find((selected) => selected.location === stay.location);
    assert.ok(hotel, `${stay.location} has no hotel selection`);
    return sum + stay.nights * nightCost(hotel);
  }, 0);
  assert.equal(cost.accommodation, expectedAccommodation, 'Accommodation must use the revised nights at the preserved or newly suggested rates');
  assert.equal(cost.transport, state.plan.days * state.costModel.transportDaily, 'Vehicle days must follow the revised trip length at the agreed daily rate');
  assert.equal(cost.activities, Object.values(state.costModel.activityCosts).reduce((sum, amount) => sum + amount, 0), 'Existing arranged group experiences must not be charged again for extra days');
  assert.equal(cost.b2bCost, cost.accommodation + cost.transport + cost.activities + state.costModel.otherAmount);
  assert.equal(cost.sellingTotal, cost.b2bCost * (1 + state.costModel.profitPct / 100) * 1.05);
}

const failures = [];
let checks = 0;
function test(name, run) {
  try { run(); checks++; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push({ name, error }); process.stderr.write(`FAIL ${name}: ${error.stack || error.message}\n`); }
}

try {
  replaceDestinationCatalog(originalCatalog.map((destination) => core.includes(destination.name) ? {
    ...destination, activities: [activityName(destination.name)], enabled_activities: [activityName(destination.name)],
    activity_copy: { [activityName(destination.name)]: `Enjoy the arranged experience in ${destination.name}.` },
    activity_timing: { [activityName(destination.name)]: { duration_minutes: 30 } },
  } : destination));

  test('Build Trip Next replans five days into seven days while preserving surviving hotel and service agreements', () => {
    const before = stateFor(['Srinagar', 'Gulmarg', 'Pahalgam', 'Srinagar']);
    before.plan = setPlanDayTrip(before.plan, 4, 'Sonamarg');
    before.costModel.activityCosts[activityKey('Sonamarg')] = 2500;
    before.costModel.activitySelections[activityKey('Sonamarg')] = true;
    const after = generatePlannerState(before, { departure: dateAfter(6) });
    assert.equal(before.plan.days, 5);
    assert.equal(after.plan.days, 7);
    assertFreshRoute(after);
    assert.notDeepEqual(routeChoices(after.plan).slice(0, before.plan.nights), routeChoices(before.plan).slice(0, before.plan.nights), 'The longer programme must not merely append days to the old route');
    assertRetainedHotels(before, after, survivingHotelLocations(before, after));
    assertOtherAgreements(before, after);
    assertActivityQuoteRetained(before, after);
    const oldCost = calculateCosts(before.plan, before.hotelSelections, before.costModel);
    const newCost = calculateCosts(after.plan, after.hotelSelections, after.costModel);
    const srinagarNight = nightCost(before.hotelSelections.find((hotel) => hotel.location === 'Srinagar'));
    assert.equal(newCost.accommodation - oldCost.accommodation, 2 * srinagarNight);
    assert.equal(newCost.transport - oldCost.transport, 2 * before.costModel.transportDaily);
    assert.equal(newCost.activities, oldCost.activities, 'Unchanged experiences were charged again');
    assert.equal(newCost.b2bCost - oldCost.b2bCost, 2 * (srinagarNight + before.costModel.transportDaily));
    assertCostQuantities(after);
  });

  test('Build Trip Next recommends a complete shorter journey and preserves activities for destinations now visited as day trips', () => {
    const before = stateFor();
    const after = generatePlannerState(before, { departure: dateAfter(4) });
    assert.equal(after.plan.nights, 4);
    assertFreshRoute(after);
    assertRetainedHotels(before, after, ['Srinagar']);
    assert.deepEqual(after.hotelSelections.map((hotel) => hotel.location), ['Srinagar'], 'Day-trip destinations must not retain overnight charges');
    assertOtherAgreements(before, after);
    assertActivityQuoteRetained(before, after);
    const oldCost = calculateCosts(before.plan, before.hotelSelections, before.costModel);
    const newCost = calculateCosts(after.plan, after.hotelSelections, after.costModel);
    const quoted = (location) => nightCost(before.hotelSelections.find((hotel) => hotel.location === location));
    assert.equal(oldCost.accommodation - newCost.accommodation, quoted('Gulmarg') + 2 * quoted('Pahalgam') - quoted('Srinagar'));
    assert.equal(oldCost.transport - newCost.transport, 2 * before.costModel.transportDaily);
    assert.equal(oldCost.activities, newCost.activities);
    assertCostQuantities(after);
  });

  test('repeated duration changes recommend each new trip length without changing surviving agreements', () => {
    const before = stateFor();
    let after = before;
    for (const nights of [7, 8, 6, 7, 6]) {
      const previous = after;
      after = generatePlannerState(previous, { departure: dateAfter(nights) });
      assertFreshRoute(after);
      assertRetainedHotels(previous, after, survivingHotelLocations(previous, after));
      assertOtherAgreements(previous, after);
      assertActivityQuoteRetained(previous, after);
      assertCostQuantities(after);
    }
    assertRetainedHotels(before, after, survivingHotelLocations(before, after));
    assert.notDeepEqual(routeChoices(after.plan), routeChoices(before.plan), 'Returning to the old duration still uses the recommended route rather than resurrecting old operator choices');
  });

  test('a longer recommended journey suggests hotels only for newly overnighted destinations', () => {
    const before = stateFor(['Srinagar', 'Srinagar', 'Srinagar', 'Srinagar']);
    const after = generatePlannerState(before, { departure: dateAfter(7) });
    assertFreshRoute(after);
    assertRetainedHotels(before, after, ['Srinagar']);
    assertOtherAgreements(before, after);
    const addedLocations = after.plan.hotelPlans.filter((stay) => stay.location !== 'Srinagar').map((stay) => stay.location);
    assert.deepEqual(addedLocations.sort(), ['Gulmarg', 'Pahalgam', 'Sonamarg']);
    for (const location of addedLocations) {
      const hotel = after.hotelSelections.find((selected) => selected.location === location);
      assert.equal(hotel.hotelId, `master-${location}`);
      assert.equal(hotel.hotelName, `${location} database hotel`);
      assert.equal(hotel.nightlyRate, 3600);
      assert.equal(hotel.extraBedRate, 800);
      assert.equal(hotel.cnbRate, 300);
      assert.equal(hotel.nights, after.plan.hotelPlans.find((stay) => stay.location === location).nights);
    }
    assertActivityQuoteRetained(before, after);
    assertCostQuantities(after);
  });

  test('duration changes regenerate every About This Day instead of retaining manual copy from the old programme', () => {
    const before = stateFor(['Srinagar', 'Gulmarg', 'Pahalgam', 'Srinagar']);
    before.plan.dayPlans = before.plan.dayPlans.map((day) => ({ ...day,
      customAbout: `Old five-day client programme for day ${day.day}.`,
      customTitle: `Old programme ${day.day}`, customAboutContext: dayScheduleContext(day) }));
    const after = generatePlannerState(before, { departure: dateAfter(6) });
    assertFreshRoute(after);
    for (const day of after.plan.dayPlans) {
      assert.equal(day.customAbout, undefined, `Day ${day.day} retained text for the old duration`);
      assert.equal(day.customTitle, undefined, `Day ${day.day} retained an old programme title`);
      const description = dayNarrative(day, after.input.pickup);
      assert.ok(description.trim(), `Day ${day.day} has no new description`);
      assert.ok(!description.includes('Old five-day client programme'));
    }
    assertRetainedHotels(before, after, survivingHotelLocations(before, after));
    assertOtherAgreements(before, after);
  });

  test('a new overnight destination alone receives a hotel suggestion', () => {
    const before = stateFor();
    const plan = rebuildPlanFromNightSequence(before.plan, [...baseSequence.slice(0, -1), 'Sonamarg']);
    const after = applyPlanEdit(before, plan);
    assertRetainedHotels(before, after);
    assertOtherAgreements(before, after);
    const added = after.hotelSelections.find((hotel) => hotel.location === 'Sonamarg');
    assert.ok(added, 'The new overnight destination needs a hotel');
    assert.equal(added.hotelId, 'master-Sonamarg');
    assert.equal(added.hotelName, 'Sonamarg database hotel');
    assert.equal(added.nightlyRate, 3600);
    assert.equal(added.nights, 1);
    const oldCost = calculateCosts(before.plan, before.hotelSelections, before.costModel);
    const newCost = calculateCosts(after.plan, after.hotelSelections, after.costModel);
    assert.equal(newCost.activities, oldCost.activities, 'A newly suggested hotel must not add activity charges');
    assert.equal(newCost.transport, oldCost.transport);
    assert.equal(newCost.accommodation - oldCost.accommodation,
      nightCost(added) - nightCost(before.hotelSelections.find((hotel) => hotel.location === 'Srinagar')));
  });

  test('a removed destination drops only its hotel and activity quote and reduces the total', () => {
    const before = stateFor();
    const plan = planFor(['Srinagar', 'Gulmarg', 'Srinagar', 'Srinagar', 'Srinagar', 'Srinagar']);
    const after = applyPlanEdit(before, plan);
    assert.ok(!after.hotelSelections.some((hotel) => hotel.location === 'Pahalgam'));
    assertRetainedHotels(before, after, ['Srinagar', 'Gulmarg']);
    assertOtherAgreements(before, after);
    assert.ok(!Object.hasOwn(after.costModel.activityCosts, activityKey('Pahalgam')), 'Removed destination retained a hidden priced activity');
    assert.ok(!Object.hasOwn(after.costModel.activitySelections, activityKey('Pahalgam')), 'Removed destination retained a hidden checkbox');
    for (const destination of ['Srinagar', 'Gulmarg']) {
      assert.equal(after.costModel.activityCosts[activityKey(destination)], before.costModel.activityCosts[activityKey(destination)]);
      assert.equal(after.costModel.activitySelections[activityKey(destination)], true);
    }
    const oldCost = calculateCosts(before.plan, before.hotelSelections, before.costModel);
    const newCost = calculateCosts(after.plan, after.hotelSelections, after.costModel);
    assert.equal(oldCost.activities - newCost.activities, before.costModel.activityCosts[activityKey('Pahalgam')]);
    assert.equal(oldCost.transport, newCost.transport, 'Moving a stay without changing duration must not change transport');
    const pahalgam = before.hotelSelections.find((hotel) => hotel.location === 'Pahalgam');
    const srinagar = before.hotelSelections.find((hotel) => hotel.location === 'Srinagar');
    assert.equal(oldCost.accommodation - newCost.accommodation, 2 * (nightCost(pahalgam) - nightCost(srinagar)));
  });

  test('re-adding a removed destination does not silently restore its old activity charge', () => {
    const before = stateFor();
    const removed = applyPlanEdit(before, planFor(['Srinagar', 'Gulmarg', 'Srinagar', 'Srinagar', 'Srinagar', 'Srinagar']));
    const returned = applyPlanEdit(removed, planFor(baseSequence));
    assert.ok(returned.hotelSelections.some((hotel) => hotel.location === 'Pahalgam'));
    assert.ok(!Object.hasOwn(returned.costModel.activityCosts, activityKey('Pahalgam')));
    assert.ok(!Object.hasOwn(returned.costModel.activitySelections, activityKey('Pahalgam')));
    assert.equal(calculateCosts(returned.plan, returned.hotelSelections, returned.costModel).activities,
      calculateCosts(removed.plan, removed.hotelSelections, removed.costModel).activities);
  });

  test('an overnight removed while its destination remains a day visit keeps that destination activity', () => {
    const before = stateFor();
    let plan = planFor(['Srinagar', 'Gulmarg', 'Srinagar', 'Srinagar', 'Srinagar', 'Srinagar']);
    plan = setPlanDayTrip(plan, 4, 'Pahalgam');
    const after = applyPlanEdit(before, plan);
    assert.ok(!after.hotelSelections.some((hotel) => hotel.location === 'Pahalgam'));
    assert.equal(after.costModel.activityCosts[activityKey('Pahalgam')], before.costModel.activityCosts[activityKey('Pahalgam')]);
    assert.equal(after.costModel.activitySelections[activityKey('Pahalgam')], true);
    assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).activities,
      calculateCosts(before.plan, before.hotelSelections, before.costModel).activities);
  });

  test('custom vehicles and custom hotel agreements survive duration edits', () => {
    const before = stateFor();
    before.input = { ...before.input, transport: 'Private luxury minibus' };
    before.plan = { ...before.plan, input: before.input };
    before.costModel = { ...before.costModel, transportIsCustom: true, transportDaily: 9137 };
    before.hotelSelections = before.hotelSelections.map((hotel) => ({ ...hotel, hotelId: '', source: 'Custom hotel', status: 'Special family rate' }));
    const after = generatePlannerState(before, { departure: dateAfter(7) });
    assertRetainedHotels(before, after);
    assertOtherAgreements(before, after);
    assert.equal(calculateCosts(after.plan, after.hotelSelections, after.costModel).transport, 8 * 9137);
  });

  test('database refreshes never rewrite selected hotel identity or negotiated rates regardless of status', () => {
    const before = stateFor();
    const changedDatabase = database.map((hotel) => ({ ...hotel, name: `${hotel.name} renamed`, mapB2B: 9999, extraBedB2B: 888, cnbB2B: 777, roomType: 'Changed master room' }));
    for (const status of ['Available', 'user-edited', 'common hotel policy applied', 'Special family rate']) {
      const selected = before.hotelSelections.map((hotel) => ({ ...hotel, status }));
      const after = { ...before, hotelSelections: syncHotelSelections(before.plan, selected, changedDatabase, before.input) };
      assertRetainedHotels({ ...before, hotelSelections: selected }, after);
      for (const hotel of after.hotelSelections) assert.equal(hotel.rateConfirmed, true, 'An unchanged stay lost verification during a master refresh');
    }
  });

  test('a selected hotel missing from a refreshed master keeps its full agreement', () => {
    const before = stateFor();
    const after = { ...before, hotelSelections: syncHotelSelections(before.plan, before.hotelSelections, [], before.input) };
    assertRetainedHotels(before, after);
  });

  test('unfilled hotel placeholders can still recover when the hotel database connects', () => {
    const before = stateFor(['Srinagar']);
    const empty = [{ ...before.hotelSelections[0], hotelId: '', hotelName: 'Hotel to be added', nightlyRate: 0, source: 'No hotel record' }];
    const selected = syncHotelSelections(before.plan, empty, database, before.input);
    assert.equal(selected[0].hotelId, 'master-Srinagar');
    assert.equal(selected[0].nightlyRate, 3600);
  });

  test('reloading a saved edited quote preserves hotel, vehicle and activity choices', () => {
    const before = generatePlannerState(stateFor(), { departure: dateAfter(7) });
    const snapshot = JSON.parse(JSON.stringify(itinerarySnapshot(before)));
    const changedDatabase = database.map((hotel) => ({ ...hotel, mapB2B: 9999 }));
    const loaded = reconcilePlannerState({ ...before, ...snapshot, hotelDatabase: changedDatabase });
    loaded.hotelSelections = syncHotelSelections(loaded.plan, loaded.hotelSelections, changedDatabase, loaded.input);
    assertRetainedHotels(before, loaded);
    assertOtherAgreements(before, loaded);
    assert.deepEqual(loaded.costModel, before.costModel);
    assert.deepEqual(calculateCosts(loaded.plan, loaded.hotelSelections, loaded.costModel), calculateCosts(before.plan, before.hotelSelections, before.costModel));
  });

  test('changed stay quantities invalidate verification without replacing the agreed hotel', () => {
    const before = stateFor();
    const after = generatePlannerState(before, { departure: dateAfter(7) });
    const dates = (plan, location) => plan.dayPlans.slice(0, plan.nights).filter((day) => day.stay === location).map((day) => day.date);
    for (const destination of survivingHotelLocations(before, after)) {
      const sameDates = JSON.stringify(dates(before.plan, destination)) === JSON.stringify(dates(after.plan, destination));
      assert.equal(after.hotelSelections.find((hotel) => hotel.location === destination).rateConfirmed, sameDates,
        `${destination} verification must follow its actual revised stay dates`);
    }
    assertRetainedHotels(before, after, survivingHotelLocations(before, after));
  });

  test('changing two adults to eight preserves manual room agreements and requires renewed hotel verification', () => {
    const before = stateFor();
    before.input = { ...before.input, adults: 2 };
    before.plan = { ...before.plan, input: before.input };
    for (const hotel of before.hotelSelections) hotel.confirmedSignature = hotelConfirmationSignature(before.plan, hotel, before.input.mealPlan);
    const after = generatePlannerState(before, { adults: 8 });
    assert.equal(after.input.adults, 8);
    assert.equal(after.plan.input.adults, 8);
    assertRetainedHotels(before, after);
    assertOtherAgreements(before, after);
    assert.deepEqual(after.costModel.activityCosts, before.costModel.activityCosts);
    for (const hotel of after.hotelSelections) assert.equal(hotel.rateConfirmed, false, `${hotel.location} needs verification for the changed party size`);
  });

  test('changing the child age mix preserves manual rooms and negotiated rates while clearing hotel verification', () => {
    const before = stateFor();
    const after = generatePlannerState(before, { youngAges: [3, 10, 12] });
    assert.deepEqual(after.input.youngAges, [3, 10, 12]);
    assert.deepEqual(after.plan.input.youngAges, [3, 10, 12]);
    assertRetainedHotels(before, after);
    assertOtherAgreements(before, after);
    for (const hotel of after.hotelSelections) assert.equal(hotel.rateConfirmed, false, `${hotel.location} needs verification for the changed child ages`);
  });

  test('an unchanged trip brief is idempotent and creates no new hotel suggestions', () => {
    // Establish the current quoted activity programme before the operator
    // edits its copy, matching the planner's setDayContent action.
    const before = reconcilePlannerState(stateFor());
    before.plan.dayPlans = before.plan.dayPlans.map((day) => ({ ...day,
      customAbout: `Client-approved programme for day ${day.day}.`, customTitle: `Approved day ${day.day}`,
      customAboutContext: dayScheduleContext(day) }));
    const after = generatePlannerState(before);
    assert.deepEqual(routeChoices(after.plan), routeChoices(before.plan));
    assert.deepEqual(after.hotelSelections, before.hotelSelections);
    assert.deepEqual(after.costModel, before.costModel);
    assertOtherAgreements(before, after);
    for (const day of after.plan.dayPlans) {
      assert.equal(day.customAbout, before.plan.dayPlans[day.day - 1].customAbout, 'Unchanged Next must retain approved manual descriptions');
      assert.equal(day.customTitle, before.plan.dayPlans[day.day - 1].customTitle);
    }
  });

  test('removing an interior day recommends the complete shorter journey and retains experiences still visited', () => {
    const before = stateFor(['Srinagar', 'Srinagar', 'Srinagar', 'Srinagar', 'Srinagar']);
    before.plan = setPlanDayTrip(before.plan, 2, 'Gulmarg');
    before.plan = setPlanDayTrip(before.plan, 3, 'Pahalgam');
    before.plan = setPlanDayTrip(before.plan, 4, 'Sonamarg');
    before.costModel.activityCosts = Object.fromEntries(core.map((destination, index) => [activityKey(destination), 1000 + index * 500]));
    before.costModel.activitySelections = Object.fromEntries(core.map((destination) => [activityKey(destination), true]));
    const shortened = removeTripDay(before.plan, 2);
    const after = applyPlanEdit({ ...before, input: shortened.input }, shortened);
    assert.equal(after.plan.days, 5);
    assertFreshRoute(after);
    assert.equal(after.plan.dayPlans[1].dayTripDestination, 'Gulmarg', 'The newly recommended shorter route should still cover Gulmarg');
    assert.equal(after.plan.dayPlans[2].dayTripDestination, 'Pahalgam');
    assert.equal(after.plan.dayPlans[3].dayTripDestination, 'Sonamarg');
    assert.equal(after.input.departure, dateAfter(4));
    for (const destination of core) {
      assert.equal(after.costModel.activityCosts[activityKey(destination)], before.costModel.activityCosts[activityKey(destination)]);
      assert.equal(after.costModel.activitySelections[activityKey(destination)], true);
    }
    assertRetainedHotels(before, after);
    assertOtherAgreements(before, after);
    const oldCost = calculateCosts(before.plan, before.hotelSelections, before.costModel);
    const newCost = calculateCosts(after.plan, after.hotelSelections, after.costModel);
    assert.equal(oldCost.activities, newCost.activities, 'Removing a day must not remove the quote for a destination still in the new programme');
    assert.equal(oldCost.accommodation - newCost.accommodation, nightCost(before.hotelSelections[0]));
    assert.equal(oldCost.transport - newCost.transport, before.costModel.transportDaily);
    assertCostQuantities(after);
  });

  test('shortening respects the early-departure Srinagar rule while preserving every remaining hotel agreement', () => {
    const before = stateFor();
    before.input = { ...before.input, departureTime: '13:00' };
    before.plan = { ...before.plan, input: before.input };
    const after = generatePlannerState(before, { departure: dateAfter(5) });
    assertFreshRoute(after);
    assert.equal(after.plan.dayPlans[after.plan.nights - 1].stay, 'Srinagar');
    assertRetainedHotels(before, after, survivingHotelLocations(before, after));
    assertOtherAgreements(before, after);
    assertActivityQuoteRetained(before, after);
    assertCostQuantities(after);
  });
} finally {
  replaceDestinationCatalog(originalCatalog);
}

if (failures.length) {
  process.stderr.write(`\n${failures.length} trip quote preservation checks failed.\n`);
  process.exitCode = 1;
} else {
  console.log(`Trip quote preservation: ${checks} checks passed.`);
}
