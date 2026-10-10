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

const { destinations, replaceDestinationCatalog, routeByName } = require('../lib/data.ts');
const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip } = require('../lib/itinerary.ts');
const { dayNarrative, activitySentence } = require('../lib/narrative.ts');
const { validateDestination } = require('../lib/destination-validation.ts');
const { tripActivities, quotedActivityCost, clientActivityLists } = require('../lib/activities.ts');
const { calculateCosts } = require('../lib/costing.ts');
const input = { name: 'Client', arrival: '2026-10-10', departure: '2026-10-15', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };

const original = [...destinations];
try {
  const srinagar = original.find((item) => item.name === 'Srinagar');
  const edited = validateDestination({ ...srinagar, id: 'Srinagar', day_note: 'Enjoy a curated Srinagar waterfront walk.', things_to_do: ['Waterfront walk', 'Closed attraction'], activities: ['Shikara ride'], enabled_things_to_do: ['Waterfront walk'], enabled_activities: [] });
  replaceDestinationCatalog([edited, ...original.filter((item) => item.name !== 'Srinagar')]);
  let plan = createPlan(input);
  let copy = dayNarrative(plan.dayPlans.find((day) => day.stay === 'Srinagar'), input.pickup);
  assert.match(copy, /curated Srinagar waterfront walk/);
  assert.equal((copy.match(/waterfront walk/gi) || []).length, 1, 'The selected experience should not duplicate the destination note.');
  assert.doesNotMatch(copy, /Closed attraction|Shikara ride|Confirm road access|confirm local access|weather/i);
  assert.equal(plan.dayPlans.filter((day) => dayNarrative(day, input.pickup).includes('curated Srinagar waterfront walk')).length, 1, 'The destination note should appear on only one visit day');
  assert.equal(plan.dayPlans.filter((day) => /waterfront walk/i.test(dayNarrative(day, input.pickup))).length, 1, 'Enabled experiences should not repeat on later Srinagar days');

  const shikara = tripActivities(plan).find((activity) => activity.destination === 'Srinagar' && activity.name === 'Shikara ride');
  assert.ok(shikara, 'All destination activities should be available for trip-specific selection.');
  assert.equal(shikara.available, false);
  const baseCost = { transportDaily: 4200, otherAmount: 0, profitPct: 10, activityCosts: {}, activitySelections: {}, manualExclusions: [] };
  const before = calculateCosts(plan, [], baseCost);
  const disabledCost = calculateCosts(plan, [], { ...baseCost, activityCosts: { [shikara.key]: 3000 }, activitySelections: { [shikara.key]: false } });
  assert.equal(quotedActivityCost(baseCost.activityCosts, shikara), null);
  assert.equal(quotedActivityCost({ [shikara.key]: 3000 }, shikara), null, 'An old price on a disabled library activity must not silently become included.');
  assert.equal(quotedActivityCost({ [shikara.key]: 3000 }, shikara, { [shikara.key]: false }), null, 'A per-trip untick must exclude an activity even when an old cost exists.');
  assert.equal(disabledCost.sellingTotal, before.sellingTotal);
  const offLists = clientActivityLists(plan, { [shikara.key]: 3000 }, { [shikara.key]: false }, ['Welcome dinner'], ['Airfare']);
  assert.ok(offLists.excluded.includes('Srinagar: Shikara ride'));
  assert.ok(offLists.excluded.includes('Airfare'));
  assert.ok(offLists.included.includes('Welcome dinner'));
  assert.ok(!offLists.included.includes('Srinagar: Shikara ride'));
  assert.equal(offLists.excluded.length, tripActivities(plan).length + 1, 'Only listed trip activities and the manual entry should be excluded.');
  const allPriced = Object.fromEntries(tripActivities(plan).map((activity) => [activity.key, 0]));
  const allSelected = Object.fromEntries(tripActivities(plan).map((activity) => [activity.key, true]));
  assert.deepEqual(clientActivityLists(plan, allPriced, allSelected).excluded, [], 'No exclusions should be generated when every listed activity is included.');
  assert.ok(clientActivityLists(plan, {}, { [shikara.key]: true }).excluded.includes('Srinagar: Shikara ride'), 'A selected but unpriced activity remains excluded.');
  const selectedShikara = shikara;
  const after = calculateCosts(plan, [], { ...baseCost, activityCosts: { [selectedShikara.key]: 3000 }, activitySelections: { [selectedShikara.key]: true } });
  assert.equal(after.activities, 3000);
  assert.ok(clientActivityLists(plan, { [selectedShikara.key]: 3000 }, { [selectedShikara.key]: true }).included.includes('Srinagar: Shikara ride'));
  assert.equal(Math.round(after.sellingTotal - before.sellingTotal), 3465, 'A ticked group activity cost should enter markup and GST once.');
  copy = dayNarrative(plan.dayPlans.find((day) => day.stay === 'Srinagar'), input.pickup, { activityCosts: { [shikara.key]: 3000 }, activitySelections: { [shikara.key]: true } });
  assert.match(copy, /Enjoy a shikara ride/);
  assert.doesNotMatch(dayNarrative(plan.dayPlans.find((day) => day.stay === 'Srinagar'), input.pickup, { activityCosts: { [shikara.key]: 3000 }, activitySelections: { [shikara.key]: false } }), /shikara ride/i);
  assert.equal(activitySentence('Take the Gondola'), 'Enjoy a gondola ride.');
  assert.equal(activitySentence('Enjoy Take the Gondola'), 'Enjoy a gondola ride.');
  assert.equal(activitySentence('Old-city heritage walk'), 'Take a heritage walk through the old city.');
  assert.equal(activitySentence('Horse riding where locally available'), 'Enjoy horse riding.');
  assert.equal(activitySentence('Kashmiri food and kahwa experience'), 'Enjoy Kashmiri food and kahwa.');

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
