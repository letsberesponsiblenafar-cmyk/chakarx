const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename, originalLoad = Module._load;
const hooks = []; let hookIndex = 0;
Module._resolveFilename = function(request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
Module._load = function(request, parent, isMain) {
  if (request === 'react') return { ...React,
    useState(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }]; },
    useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useEffect() {}, useMemo: callback => callback() };
  return originalLoad.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);
};
const data = require('../lib/data.ts');
const { createPlan, setPlanDayTrip, retargetDay, reschedulePlan, validatedTripInput } = require('../lib/itinerary.ts');
const { tripDuration } = require('../lib/trip-dates.ts');
const { itinerarySnapshot, restoreSavedItinerary, reconcilePlannerState, updatePlannerToCurrentData, PlannerProvider } = require('../components/PlannerProvider.tsx');
const { calculateCosts } = require('../lib/costing.ts');
const { accommodationDayNarrative } = require('../lib/accommodation.ts');
const { clientActivityLists } = require('../lib/activities.ts');
const { hotelConfirmationSignature, quoteReadiness } = require('../lib/quote-readiness.ts');
const original = [...data.destinations], oldFetch = global.fetch;
const clone = value => JSON.parse(JSON.stringify(value));
const input = { name: 'Saved trip isolation', arrival: '2026-11-01', departure: '2026-11-03', arrivalTime: '09:00', departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 60000,
  hotelCategory: 'Signature', packagePreferences: ['Signature', 'Signature Plus'], hotelOptionMode: 'multiple', transport: 'Ertiga', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
let checks = 0;
function test(label, run) { run(); checks++; console.log(`PASS ${label}`); }
const oldGuide = { ...original.find(place => place.name === 'Srinagar'), day_note: 'The original saved city introduction.',
  local_sightseeing: [{ name: 'Original garden', description: 'Original garden visit.', client_sentence: 'Explore the original garden.', tags: [], visit_minutes: 30, transfer_minutes: 0 }],
  enabled_sightseeing: ['Original garden'], activities: ['Private walk'], enabled_activities: ['Private walk'],
  activity_copy: { 'Private walk': 'Enjoy the original private walk.' }, activity_timing: { 'Private walk': { duration_minutes: 30 } } };
const changedGuide = { ...oldGuide, day_note: 'A NEW library introduction.',
  local_sightseeing: [{ ...oldGuide.local_sightseeing[0], name: 'New garden', description: 'The new garden.', client_sentence: 'Explore the new garden.' }],
  enabled_sightseeing: ['New garden'], enabled_activities: [] };
const beforeDefaults = { included: ['Original package inclusion.'], excluded: ['Original package exclusion.'] };
const currentDefaults = { included: ['Current package inclusion.'], excluded: ['Current package exclusion.'] };
const master = { id: 'saved-hotel', name: 'Original Hotel', destination: 'Srinagar', normalizedCategory: 'Signature', sourceCategory: '3 Star', starRating: 3,
  mapB2B: 2000, extraBedB2B: 500, cnbB2B: 200, address: 'Original address', roomType: 'Double', website: '', sourceType: 'Supplier',
  rateValidity: '2026-11-01 to 2026-11-30', availabilityStatus: 'Available', lastUpdated: '2026-10-01', sourceFiles: [], notes: '' };
const changedMaster = { ...master, name: 'Changed Hotel', normalizedCategory: 'Elite', mapB2B: 99999, rateValidity: '2027-01-01 to 2027-01-31', availabilityStatus: 'Closed' };
const model = { transportDaily: 4200, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0,
  activityCosts: { 'Srinagar\u001fPrivate walk': 1250 }, activitySelections: { 'Srinagar\u001fPrivate walk': true },
  manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
function fixture() {
  data.replaceDestinationCatalog(original.map(place => place.name === oldGuide.name ? oldGuide : place));
  let plan = createPlan(input);
  for (let day = 1; day <= plan.nights; day++) plan = setPlanDayTrip(plan, day, null);
  plan = reschedulePlan(plan, model);
  const selected = { location: 'Srinagar', hotelId: master.id, hotelName: master.name, category: master.normalizedCategory, starRating: 3, address: master.address,
    roomType: master.roomType, website: '', nights: plan.nights, rooms: 1, extraBeds: 0, cnb: 0,
    nightlyRate: 1900, extraBedRate: 450, cnbRate: 150, source: master.sourceType, status: 'user-edited', rateConfirmed: true,
    alternatives: [{ hotelId: '', customId: 'manual-alternative', hotelName: 'Negotiated alternative', category: '3 Star', source: 'Custom hotel', status: 'user-edited', nightlyRate: 2100, extraBedRate: 450, cnbRate: 150 }] };
  selected.confirmedSignature = hotelConfirmationSignature(plan, selected, input.mealPlan);
  return { input: clone(input), plan, routeVersion: 'saved-version', hotelSelections: [selected], hotelDatabase: [master],
    packageQuotes: { 'Signature Plus': { hotelSelections: [{ ...clone(selected), hotelId: '', hotelName: 'Plus negotiated hotel', source: 'Custom hotel' }], costOverrides: { profitPct: 15, otherAmount: 750 } } },
    costModel: clone(model), hotelDefaults: { rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }, generated: true, savedItineraryId: null };
}
function copyText(state) { return state.plan.dayPlans.map(day => accommodationDayNarrative(state.plan, state.hotelSelections, day, state.input.pickup, state.costModel)).join(' '); }
function render() { hookIndex = 0; return PlannerProvider({ children: null }).props.value; }
(async () => {
  try {
    test('impossible dates are rejected consistently by trip creation and duration fields', () => {
      for (const arrival of ['2027-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '2026-11-00', '2026-2-01']) {
        assert.throws(() => validatedTripInput({ ...input, arrival }), /calendar dates/);
        assert.equal(tripDuration(arrival, input.departure), null);
      }
      assert.equal(tripDuration('2028-02-29', '2028-03-01').nights, 1);
      assert.doesNotThrow(() => createPlan({ ...input, arrival: '2028-02-29', departure: '2028-03-01' }));
      assert.throws(() => createPlan({ ...input, departure: '2026-11-31' }), /calendar dates/);
    });
    test('fractional traveller counts and fractional child ages are rejected without rounding', () => {
      for (const adults of [1.5, 0, -1, NaN, Infinity, '2']) assert.throws(() => validatedTripInput({ ...input, adults }), /whole number/);
      for (const age of [5.5, -1, 100, NaN]) assert.throws(() => validatedTripInput({ ...input, youngAges: [age] }), /whole numbers/);
      const normalized = validatedTripInput({ ...input, youngAges: [0, 14, 15] });
      assert.equal(normalized.adults, 3); assert.deepEqual(normalized.youngAges, [0, 14]);
    });
    const before = fixture(), oldText = copyText(before), oldCosts = calculateCosts(before.plan, before.hotelSelections, before.costModel);
    const snapshot = clone(itinerarySnapshot(before, beforeDefaults));
    test('save captures reference data, both package quotes, and exact day plans without freezing the live draft', () => {
      assert.equal(before.plan.referenceMode, undefined); assert.equal(snapshot.plan.referenceMode, 'saved');
      assert.deepEqual(snapshot.plan.dayPlans, clone(before.plan.dayPlans));
      assert.deepEqual(snapshot.packageQuotes, clone(before.packageQuotes));
      assert.equal(snapshot.plan.hotelSnapshot.length, 1);
      assert.deepEqual(snapshot.plan.packageDefaultsSnapshot, beforeDefaults);
      assert.deepEqual(snapshot.hotelSelections[0].alternatives, before.hotelSelections[0].alternatives);
    });
    data.replaceDestinationCatalog(original.map(place => place.name === changedGuide.name ? changedGuide : place));
    const restored = restoreSavedItinerary({ ...before, hotelDatabase: [changedMaster] }, 'saved-record', snapshot);
    test('reopening preserves descriptions, sightseeing, activities, prices and package choices after external edits', () => {
      assert.deepEqual(restored.plan.dayPlans, snapshot.plan.dayPlans);
      assert.equal(copyText(restored), oldText); assert.match(oldText, /original saved city introduction/);
      assert.deepEqual(calculateCosts(restored.plan, restored.hotelSelections, restored.costModel), oldCosts);
      assert.deepEqual(restored.packageQuotes, snapshot.packageQuotes);
      assert.equal(restored.savedItineraryId, 'saved-record');
      assert.equal(reconcilePlannerState(restored), restored);
    });
    test('current global package defaults and a changed/deleted master cannot alter saved quote terms or readiness', () => {
      const terms = clientActivityLists(restored.plan, model.activityCosts, model.activitySelections, [], [], data.destinations, currentDefaults);
      assert.ok(terms.included.includes(beforeDefaults.included[0])); assert.ok(!terms.included.includes(currentDefaults.included[0]));
      for (const hotels of [[changedMaster], []]) {
        const issues = quoteReadiness(restored.plan, restored.input, restored.hotelSelections, restored.costModel, hotels, 'ready', 'ready');
        assert.ok(!issues.some(issue => /master record is unavailable|outside the stay dates/.test(issue)), issues.join('\n'));
      }
      data.replaceDestinationCatalog(original.filter(place => place.name !== 'Srinagar'));
      assert.equal(copyText(restored), oldText);
      assert.doesNotThrow(() => retargetDay(restored.plan, 2, 'Srinagar'), 'Saved route controls must still recognise a removed historical destination.');
    });
    test('legacy saved records are pinned on load using stored guides and retain their stored days', () => {
      const legacy = clone(snapshot); delete legacy.plan.referenceMode; delete legacy.plan.hotelSnapshot; delete legacy.plan.packageDefaultsSnapshot;
      const loaded = restoreSavedItinerary({ ...before, hotelDatabase: [changedMaster] }, 'legacy-record', legacy);
      assert.equal(copyText(loaded), oldText); assert.deepEqual(loaded.plan.dayPlans, legacy.plan.dayPlans);
      assert.equal(loaded.plan.hotelSnapshot[0].name, master.name);
    });
    test('manually adding a new destination captures its guide without refreshing the existing saved guides', () => {
      data.replaceDestinationCatalog(original.map(place => place.name === changedGuide.name ? changedGuide : place));
      const edited = setPlanDayTrip(restored.plan, 2, 'Gulmarg');
      assert.ok(edited.destinationSnapshot.some(place => place.name === 'Gulmarg'));
      assert.equal(edited.destinationSnapshot.find(place => place.name === 'Srinagar').day_note, oldGuide.day_note);
      assert.equal(edited.referenceMode, 'saved');
      assert.equal(reschedulePlan(edited, model).dayPlans[1].dayTripDestination, 'Gulmarg');
    });
    test('explicit update applies current library content and terms while preserving route and agreed prices', () => {
      const catalog = original.map(place => place.name === changedGuide.name ? changedGuide : place);
      const updated = updatePlannerToCurrentData(restored, catalog, [changedMaster], currentDefaults);
      assert.equal(updated.plan.referenceMode, 'saved'); assert.equal(updated.savedItineraryId, 'saved-record');
      assert.deepEqual(updated.plan.dayPlans.map(day => [day.date, day.stay, day.dayTripDestination]), restored.plan.dayPlans.map(day => [day.date, day.stay, day.dayTripDestination]));
      assert.match(copyText(updated), /NEW library introduction/); assert.doesNotMatch(copyText(updated), /original garden|original private walk/);
      assert.equal(calculateCosts(updated.plan, updated.hotelSelections, updated.costModel).activities, 0);
      assert.equal(updated.hotelSelections[0].nightlyRate, 1900);
      assert.deepEqual(updated.plan.packageDefaultsSnapshot, currentDefaults);
      const reopened = restoreSavedItinerary(before, 'saved-record', clone(itinerarySnapshot(updated)));
      assert.equal(copyText(reopened), copyText(updated));
    });
    const catalog = original.map(place => place.name === changedGuide.name ? changedGuide : place);
    const posted = [];
    global.fetch = async (url, options) => {
      if (url === '/api/destinations') return Response.json({ destinations: catalog, archivedDestinations: [] });
      if (url === '/api/hotels') return Response.json({ configured: true, hotels: [changedMaster] });
      if (url === '/api/package-defaults') return Response.json({ packageDefaults: currentDefaults });
      if (url === '/api/itineraries') { posted.push(JSON.parse(options.body)); return Response.json({ itinerary: { id: 'saved-record' } }); }
      throw new Error(`Unexpected request ${url}`);
    };
    render().loadSavedItinerary('saved-record', snapshot);
    await render().refreshDestinations(true); await render().refreshHotels();
    test('provider library/hotel refreshes do not reschedule or rewrite a saved itinerary', () => {
      const planner = render(); assert.deepEqual(planner.plan.dayPlans, snapshot.plan.dayPlans);
      assert.equal(copyText(planner), oldText); assert.deepEqual(planner.hotelSelections, snapshot.hotelSelections);
    });
    test('manual activity and description edits still work using the saved reference data', () => {
      render().setCostModel({ activitySelections: { 'Srinagar\u001fPrivate walk': false } });
      assert.equal(calculateCosts(render().plan, render().hotelSelections, render().costModel).activities, 0);
      assert.doesNotMatch(copyText(render()), /original private walk/);
      render().setDayContent(2, { about: 'A manual description for this saved trip.' });
      assert.match(copyText(render()), /manual description/);
      render().loadSavedItinerary('saved-record', snapshot);
      const minutes = render().plan.dayPlans[1].timing.scheduledMinutes;
      render().addDayBlock(2, { name: 'Custom visit', description: 'A manually arranged visit.' });
      assert.ok(render().plan.dayPlans[1].timing.scheduledMinutes >= minutes + 60);
      const index = render().plan.dayPlans[1].blocks.findIndex(block => block.name === 'Custom visit');
      render().removeDayBlock(2, index);
      assert.ok(!render().plan.dayPlans[1].blocks.some(block => block.name === 'Custom visit'));
      render().loadSavedItinerary('saved-record', snapshot);
    });
    await render().updateItineraryToCurrentData();
    test('manual update persists to the existing saved record and remains pinned afterwards', () => {
      assert.equal(posted.length, 1); assert.equal(posted[0].id, 'saved-record'); assert.equal(posted[0].downloaded, false);
      assert.equal(posted[0].snapshot.plan.referenceMode, 'saved');
      assert.match(copyText(render()), /NEW library introduction/);
      assert.deepEqual(posted[0].snapshot.plan.packageDefaultsSnapshot, currentDefaults);
    });
    const stable = clone(render().plan), stableCatalog = clone(render().destinationCatalog);
    global.fetch = async () => Response.json({ error: 'Read failed.' }, { status: 503 });
    await assert.rejects(render().updateItineraryToCurrentData(), /Read failed/);
    test('failed refresh keeps the saved trip intact and clears the busy state', () => {
      assert.deepEqual(render().plan, stable); assert.equal(render().updatingItineraryData, false);
    });
    global.fetch = async url => url === '/api/itineraries' ? Response.json({ error: 'Save failed.' }, { status: 503 })
      : url === '/api/destinations' ? Response.json({ destinations: [oldGuide] })
      : url === '/api/hotels' ? Response.json({ configured: true, hotels: [master] }) : Response.json({ packageDefaults: beforeDefaults });
    await assert.rejects(render().updateItineraryToCurrentData(), /Save failed/);
    test('failed online save does not partially apply the fetched update or alter the library', () => {
      assert.deepEqual(render().plan, stable); assert.deepEqual(clone(render().destinationCatalog), stableCatalog);
    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    global.fetch = async url => {
      await gate;
      if (url === '/api/itineraries') throw new Error('A stale update must not save over newer edits.');
      return url === '/api/destinations' ? Response.json({ destinations: catalog })
        : url === '/api/hotels' ? Response.json({ configured: true, hotels: [changedMaster] }) : Response.json({ packageDefaults: currentDefaults });
    };
    const pendingUpdate = render().updateItineraryToCurrentData();
    render().setCostModel({ otherAmount: 654 }); render();
    release();
    await assert.rejects(pendingUpdate, /changed while loading/);
    test('an in-flight update cannot replace edits made after the button was clicked', () => {
      assert.equal(render().costModel.otherAmount, 654); assert.equal(render().updatingItineraryData, false);
    });
    console.log(`Saved-data isolation: ${checks} checks passed.`);
  } finally { data.replaceDestinationCatalog(original); global.fetch = oldFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
