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
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};

const { destinations, enabledSightseeing, replaceDestinationCatalog, routeByName } = require('../lib/data.ts');
const { createPlan, rebuildPlanFromNightSequence, retargetDay, setPlanDayTrip } = require('../lib/itinerary.ts');
const { dayNarrative, activitySentence, sightseeingSentence } = require('../lib/narrative.ts');
const { validateDestination } = require('../lib/destination-validation.ts');
const { tripActivities, quotedActivityCost, clientActivityLists } = require('../lib/activities.ts');
const { calculateCosts } = require('../lib/costing.ts');
const input = { name: 'Client', arrival: '2026-10-10', departure: '2026-10-15', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };

const original = [...destinations];
try {
  const srinagar = original.find((item) => item.name === 'Srinagar');
  const edited = validateDestination({ ...srinagar, id: 'Srinagar', day_note: 'Enjoy a curated Srinagar waterfront walk.',
    local_sightseeing: srinagar.local_sightseeing.map((sight) => sight.name === 'Dal Lake & Boulevard' ? { ...sight, client_sentence: 'Walk beside Dal Lake and its traditional houseboats.' } : sight),
    things_to_do: ['Unrelated legacy text'], enabled_sightseeing: ['Dal Lake & Boulevard'], activities: ['Shikara ride'],
    activity_copy: { 'Shikara ride': 'Enjoy a private shikara cruise on Dal Lake.' }, enabled_activities: [] });
  assert.deepEqual(edited.things_to_do, edited.local_sightseeing.map((sight) => sight.name), 'Things to Do must come from the editable sightseeing records.');
  assert.deepEqual(enabledSightseeing(edited), ['Dal Lake & Boulevard']);
  replaceDestinationCatalog([edited, ...original.filter((item) => item.name !== 'Srinagar')]);
  let plan = createPlan(input);
  const gulmargDay = plan.dayPlans.find((day) => day.stay === 'Gulmarg');
  assert.ok(gulmargDay, 'The suggested route should include Gulmarg.');
  const dayTripPlan = setPlanDayTrip(retargetDay(plan, gulmargDay.day, 'Srinagar'), gulmargDay.day, 'Gulmarg');
  assert.equal(dayTripPlan.dayPlans[gulmargDay.day - 1].dayTripDestination, 'Gulmarg', 'Changing the night to Srinagar must preserve the Gulmarg day visit.');
  assert.equal(dayTripPlan.dayPlans[gulmargDay.day - 1].stay, 'Srinagar');
  let copy = dayNarrative(plan.dayPlans.find((day) => day.stay === 'Srinagar'), input.pickup);
  assert.match(copy, /curated Srinagar waterfront walk/);
  assert.match(copy, /Walk beside Dal Lake and its traditional houseboats/);
  assert.doesNotMatch(copy, /Shankaracharya Temple|Pari Mahal|Unrelated legacy text/);
  assert.equal((copy.match(/waterfront walk/gi) || []).length, 1, 'The destination introduction should not repeat.');
  assert.doesNotMatch(copy, /Closed attraction|Shikara ride|Confirm road access|confirm local access|weather/i);
  assert.equal(plan.dayPlans.filter((day) => dayNarrative(day, input.pickup).includes('curated Srinagar waterfront walk')).length, 1, 'The destination note should appear on only one visit day');
  assert.equal(plan.dayPlans.filter((day) => /Dal Lake and its traditional houseboats/i.test(dayNarrative(day, input.pickup))).length, 1, 'Enabled sightseeing should appear on only one visit day');
  replaceDestinationCatalog([{ ...edited, enabled_sightseeing: [] }, ...original.filter((item) => item.name !== 'Srinagar')]);
  const disabledPlan = createPlan(input);
  assert.ok(!disabledPlan.dayPlans.flatMap((day) => day.blocks).some((block) => block.destination === 'Srinagar' && block.name === 'Dal Lake & Boulevard'), 'Unticked sightseeing cannot be scheduled.');
  const refreshedPlan = rebuildPlanFromNightSequence(plan, plan.dayPlans.slice(0, plan.nights).map((day) => day.stay));
  assert.ok(!refreshedPlan.dayPlans.flatMap((day) => day.blocks).some((block) => block.destination === 'Srinagar' && block.name === 'Dal Lake & Boulevard'), 'Refreshing an existing route must remove unticked sightseeing.');
  replaceDestinationCatalog([edited, ...original.filter((item) => item.name !== 'Srinagar')]);

  const shikara = tripActivities(plan).find((activity) => activity.destination === 'Srinagar' && activity.name === 'Shikara ride');
  assert.ok(shikara, 'All destination activities should be available for trip-specific selection.');
  assert.equal(shikara.available, false);
  const baseCost = { transportDaily: 4200, otherAmount: 0, profitPct: 10, activityCosts: {}, activitySelections: {}, manualExclusions: [] };
  const before = calculateCosts(plan, [], baseCost);
  const disabledCost = calculateCosts(plan, [], { ...baseCost, activityCosts: { [shikara.key]: 3000 }, activitySelections: { [shikara.key]: false } });
  assert.equal(quotedActivityCost(baseCost.activityCosts, shikara), null);
  assert.equal(quotedActivityCost({ [shikara.key]: 3000 }, shikara), null, 'An old price on a disabled library activity must not silently become included.');
  assert.equal(quotedActivityCost({ [shikara.key]: 3000 }, shikara, { [shikara.key]: false }), null, 'A per-trip untick must exclude an activity even when an old cost exists.');
  assert.equal(quotedActivityCost({ [shikara.key]: 3000 }, shikara, { [shikara.key]: true }), null, 'A trip selection cannot override an unavailable library activity.');
  assert.equal(disabledCost.sellingTotal, before.sellingTotal);
  const offLists = clientActivityLists(plan, { [shikara.key]: 3000 }, { [shikara.key]: false }, ['Welcome dinner'], ['Airfare']);
  assert.ok(offLists.excluded.includes('Srinagar: Shikara ride'));
  assert.ok(offLists.excluded.includes('Airfare'));
  assert.ok(offLists.included.includes('Welcome dinner'));
  assert.ok(!offLists.included.includes('Srinagar: Shikara ride'));
  assert.equal(offLists.excluded.length, 2, 'Only explicitly excluded activities and manual exclusions should be printed.');
  assert.deepEqual(clientActivityLists(plan, {}, {}).excluded, [], 'Untouched activities should not become a long client exclusion list.');
  const allPriced = Object.fromEntries(tripActivities(plan).map((activity) => [activity.key, 0]));
  const allSelected = Object.fromEntries(tripActivities(plan).map((activity) => [activity.key, true]));
  assert.deepEqual(clientActivityLists(plan, allPriced, allSelected).excluded, [], 'No exclusions should be generated when every listed activity is included.');
  assert.ok(!clientActivityLists(plan, {}, { [shikara.key]: true }).included.includes('Srinagar: Shikara ride'), 'A selected but unpriced activity cannot be included.');
  replaceDestinationCatalog([{ ...edited, enabled_activities: ['Shikara ride'] }, ...original.filter((item) => item.name !== 'Srinagar')]);
  const selectedShikara = tripActivities(plan).find((activity) => activity.key === shikara.key);
  assert.equal(selectedShikara.available, true);
  const after = calculateCosts(plan, [], { ...baseCost, activityCosts: { [selectedShikara.key]: 3000 }, activitySelections: { [selectedShikara.key]: true } });
  assert.equal(after.activities, 3000);
  assert.ok(clientActivityLists(plan, { [selectedShikara.key]: 3000 }, { [selectedShikara.key]: true }).included.includes('Srinagar: Shikara ride'));
  assert.equal(Math.round(after.sellingTotal - before.sellingTotal), 3465, 'A ticked group activity cost should enter markup and GST once.');
  copy = dayNarrative(plan.dayPlans.find((day) => day.stay === 'Srinagar'), input.pickup, { activityCosts: { [shikara.key]: 3000 }, activitySelections: { [shikara.key]: true } });
  assert.match(copy, /Enjoy a private shikara cruise on Dal Lake/);
  assert.doesNotMatch(dayNarrative(plan.dayPlans.find((day) => day.stay === 'Srinagar'), input.pickup, { activityCosts: { [shikara.key]: 3000 }, activitySelections: { [shikara.key]: false } }), /shikara ride/i);
  assert.equal(activitySentence('Take the Gondola'), 'Enjoy a gondola ride.');
  assert.equal(activitySentence('Enjoy Take the Gondola'), 'Enjoy a gondola ride.');
  assert.equal(activitySentence('Old-city heritage walk'), 'Take a heritage walk through the old city.');
  assert.equal(activitySentence('Horse riding where locally available'), 'Enjoy horse riding.');
  assert.equal(activitySentence('Kashmiri food and kahwa experience'), 'Enjoy Kashmiri food and kahwa.');
  assert.equal(sightseeingSentence({ name: 'Hazratbal Shrine', description: 'White-marble shrine on Dal Lake.' }), 'Visit Hazratbal Shrine for its white-marble shrine on Dal Lake.');

  const custom = validateDestination({ ...edited, id: 'test-custom', name: 'Test Valley', tier: 'Secondary', district: 'Srinagar', day_note: 'Discover the riverside scenery.', srinagar_hours: 2, srinagar_km: 75, things_to_do: [], activities: [], enabled_things_to_do: [], enabled_activities: [] });
  replaceDestinationCatalog([...destinations, custom]);
  assert.equal(routeByName('Srinagar', 'Test Valley').hours, 2);
  const withVisit = setPlanDayTrip(plan, 2, 'Test Valley');
  assert.equal(withVisit.dayPlans[1].dayTripDestination, 'Test Valley');
  assert.match(dayNarrative(withVisit.dayPlans[1], input.pickup), /riverside scenery/);
  const pahalgam = destinations.find((item) => item.name === 'Pahalgam');
  replaceDestinationCatalog(destinations.map((item) => item.name === 'Pahalgam' ? { ...pahalgam, srinagar_hours: 3.2 } : item));
  const viaSrinagar = rebuildPlanFromNightSequence(plan, ['Srinagar', 'Gulmarg', 'Pahalgam', 'Pahalgam', 'Srinagar']);
  assert.deepEqual(viaSrinagar.dayPlans[2].drive.via, ['Srinagar']);
  assert.equal(viaSrinagar.dayPlans[2].drive.hours, routeByName('Gulmarg', 'Srinagar').hours + 3.2);
} finally { replaceDestinationCatalog(original); }
console.log('Destination edits, activity switches, new routes and client-safe day copy passed.');
