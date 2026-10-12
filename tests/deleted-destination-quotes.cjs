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

const { destinations, replaceDestinationCatalog, replaceArchivedDestinationCatalog } = require('../lib/data.ts');
const { createPlan, setPlanDayTrip, rebuildPlanFromNightSequence, reschedulePlan } = require('../lib/itinerary.ts');
const { accommodationDayNarrative } = require('../lib/accommodation.ts');
const { tripActivities, clientActivityLists } = require('../lib/activities.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { reconcilePlannerState } = require('../components/PlannerProvider.tsx');
const original = [...destinations];
const input = { name: 'Saved destination QA', arrival: '2026-10-15', departure: '2026-10-22', arrivalTime: '08:00',
  departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature',
  transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
const activityName = 'Private river experience';
const activityKey = `Custom Valley\u001f${activityName}`;
const model = { transportDaily: 1234, transportIsCustom: true, mealPerPersonNight: 0, activityBudget: 0,
  activityCosts: { [activityKey]: 2750 }, activitySelections: { [activityKey]: true },
  manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
const custom = { ...original.find((destination) => destination.name === 'Sonamarg'), id: 'custom-valley', name: 'Custom Valley',
  overnight_allowed: false, srinagar_km: 35, srinagar_hours: 1, hub_route: undefined, day_note: 'Discover a quiet riverside valley.',
  local_sightseeing: [{ name: 'Custom riverside stop', description: '', client_sentence: 'Explore the private riverside viewpoint.', tags: [], visit_minutes: 30 }],
  enabled_sightseeing: ['Custom riverside stop'], activities: [activityName], enabled_activities: [activityName],
  activity_copy: { [activityName]: 'Enjoy a private river experience.' }, activity_timing: { [activityName]: { duration_minutes: 45 } } };
const log = (message) => console.log(`PASS ${message}`);
try {
  replaceArchivedDestinationCatalog([]);
  replaceDestinationCatalog([...original, custom]);
  let plan = createPlan(input);
  const srinagarDay = plan.dayPlans.find((day) => day.day > 1 && day.day <= plan.nights && day.stay === 'Srinagar');
  plan = setPlanDayTrip(plan, srinagarDay.day, custom.name);
  plan = reschedulePlan(plan, model);
  assert.ok(plan.destinationSnapshot.some((destination) => destination.name === custom.name), 'Day-trip guides must be captured, not only overnight bases.');
  const beforeCopy = accommodationDayNarrative(plan, [], plan.dayPlans[srinagarDay.day - 1], input.pickup, model);
  assert.match(beforeCopy, /private riverside viewpoint/);
  assert.match(beforeCopy, /private river experience/);
  const beforePrice = calculateCosts(plan, [], model).sellingTotal;

  replaceDestinationCatalog(original);
  replaceArchivedDestinationCatalog([{ ...custom, kind: 'deleted-destination' }]);
  const restored = reschedulePlan(JSON.parse(JSON.stringify(plan)), model);
  assert.equal(accommodationDayNarrative(restored, [], restored.dayPlans[srinagarDay.day - 1], input.pickup, model), beforeCopy);
  assert.equal(calculateCosts(restored, [], model).sellingTotal, beforePrice);
  assert.equal(calculateCosts(restored, [], model).activities, 2750);
  assert.ok(tripActivities(restored, [...destinations]).some((activity) => activity.key === activityKey));
  assert.ok(clientActivityLists(restored, model.activityCosts, model.activitySelections).included.includes(`Custom Valley: ${activityName}`));
  assert.ok(!destinations.some((destination) => destination.name === custom.name), 'Quote-scoped rendering must restore the active catalogue.');
  log('deleted custom day-trip guides retain sightseeing, activity copy, inclusions and the agreed activity price');

  const legacy = JSON.parse(JSON.stringify(plan)); delete legacy.destinationSnapshot;
  const legacyRestored = reschedulePlan(legacy, model);
  assert.equal(accommodationDayNarrative(legacyRestored, [], legacyRestored.dayPlans[srinagarDay.day - 1], input.pickup, model), beforeCopy);
  assert.equal(calculateCosts(legacyRestored, [], model).sellingTotal, beforePrice);
  log('legacy saved day-trip quotes recover their removed guide from the archived database record');

  const state = { input, plan, routeVersion: 'fixture', hotelSelections: [], hotelDatabase: [], costModel: model,
    hotelDefaults: { rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 0, extraBedRate: 0, cnbRate: 0 }, generated: true, savedItineraryId: 'existing-client' };
  assert.equal(calculateCosts(reconcilePlannerState(state).plan, [], model).sellingTotal, beforePrice);
  log('restoring a client quote after deletion keeps the same service total');

  const activeEdit = { ...custom, enabled_sightseeing: [], enabled_activities: [] };
  replaceDestinationCatalog([...original, activeEdit]);
  const edited = reschedulePlan(plan, model);
  assert.doesNotMatch(accommodationDayNarrative(edited, [], edited.dayPlans[srinagarDay.day - 1], input.pickup, model), /private riverside viewpoint|private river experience/);
  assert.equal(calculateCosts(edited, [], model).activities, 0);
  log('active library checkbox edits still override saved guide snapshots');

  replaceDestinationCatalog(original);
  const corePlan = createPlan(input);
  const gulmarg = original.find((destination) => destination.name === 'Gulmarg');
  const coreCopy = corePlan.dayPlans.map((day) => accommodationDayNarrative(corePlan, [], day, input.pickup, model));
  replaceDestinationCatalog(original.filter((destination) => destination.name !== 'Gulmarg'));
  replaceArchivedDestinationCatalog([custom, gulmarg]);
  const preservedCore = rebuildPlanFromNightSequence(corePlan, corePlan.dayPlans.slice(0, corePlan.nights).map((day) => day.stay));
  assert.deepEqual(preservedCore.dayPlans.map((day) => accommodationDayNarrative(preservedCore, [], day, input.pickup, model)), coreCopy);
  const fresh = createPlan(input);
  assert.ok(!fresh.dayPlans.some((day) => day.stay === 'Gulmarg' || day.dayTripDestination === 'Gulmarg'));
  assert.ok(!fresh.destinationSnapshot.some((destination) => destination.name === 'Gulmarg'));
  log('deleted core destinations remain in existing quotes but are absent from fresh recommendations');

  const srinagar = original.find((destination) => destination.name === 'Srinagar');
  replaceDestinationCatalog([srinagar, custom]);
  const beforeRemoval = createPlan(input);
  const customDay = beforeRemoval.dayPlans.find((day) => day.dayTripDestination === custom.name);
  assert.ok(customDay, 'The custom guide should initially be a suggested day trip.');
  replaceDestinationCatalog([srinagar]);
  replaceArchivedDestinationCatalog([custom]);
  const withoutVisit = setPlanDayTrip(beforeRemoval, customDay.day, null);
  assert.ok(!withoutVisit.dayPlans.some((day) => day.dayTripDestination === custom.name), 'Removing the old visit must not automatically put the deleted guide on a spare day.');
  const rebuiltWithoutVisit = rebuildPlanFromNightSequence(withoutVisit, withoutVisit.dayPlans.slice(0, withoutVisit.nights).map((day) => day.stay));
  assert.ok(!rebuiltWithoutVisit.dayPlans.some((day) => day.dayTripDestination === custom.name));
  assert.equal(calculateCosts(rebuiltWithoutVisit, [], model).activities, 0);
  log('removed archived day trips cannot be recommended again on another day during route edits');

  replaceDestinationCatalog(original.filter((destination) => destination.name !== 'Srinagar'));
  replaceArchivedDestinationCatalog([srinagar]);
  const noCityGuide = reschedulePlan(createPlan(input), model);
  assert.ok(noCityGuide.hotelPlans.some((stay) => stay.location === 'Srinagar'), 'Airport/hotel logistics must remain usable.');
  assert.ok(!noCityGuide.dayPlans.some((day) => day.blocks.some((block) => block.kind === 'sightseeing' && block.destination === 'Srinagar')));
  assert.ok(!tripActivities(noCityGuide).some((activity) => activity.destination === 'Srinagar'));
  assert.ok(!destinations.some((destination) => destination.name === 'Srinagar'));
  log('deleting the Srinagar guide retains necessary hub logistics without reintroducing its removed sightseeing');
} finally {
  replaceDestinationCatalog(original);
  replaceArchivedDestinationCatalog([]);
}
console.log('Deleted destination quote preservation: 7 checks passed.');
