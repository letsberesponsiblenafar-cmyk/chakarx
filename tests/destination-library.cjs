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
const { createPlan, setPlanDayTrip } = require('../lib/itinerary.ts');
const { dayNarrative } = require('../lib/narrative.ts');
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
  assert.match(copy, /Waterfront walk/);
  assert.doesNotMatch(copy, /Closed attraction|Shikara ride|Confirm road access|confirm local access|weather/i);
  assert.equal(plan.dayPlans.filter((day) => dayNarrative(day, input.pickup).includes('curated Srinagar waterfront walk')).length, 1, 'The destination note should appear on only one visit day');
  assert.equal(plan.dayPlans.filter((day) => dayNarrative(day, input.pickup).includes('Waterfront walk')).length, 1, 'Enabled experiences should not repeat on later Srinagar days');

  const shikara = tripActivities(plan).find((activity) => activity.destination === 'Srinagar' && activity.name === 'Shikara ride');
  assert.ok(shikara, 'Unticked activities should remain available to the PDF exclusions list.');
  assert.equal(shikara.available, false);
  const baseCost = { transportDaily: 4200, otherAmount: 0, profitPct: 10, activityCosts: {} };
  const before = calculateCosts(plan, [], baseCost);
  const disabledCost = calculateCosts(plan, [], { ...baseCost, activityCosts: { [shikara.key]: 3000 } });
  assert.equal(quotedActivityCost(baseCost.activityCosts, shikara), null);
  assert.equal(quotedActivityCost({ [shikara.key]: 3000 }, shikara), null, 'An old quote must not re-include an unticked activity.');
  assert.equal(disabledCost.sellingTotal, before.sellingTotal);
  assert.ok(clientActivityLists(plan, { [shikara.key]: 3000 }).excluded.includes('Srinagar: Shikara ride'));
  assert.ok(!clientActivityLists(plan, { [shikara.key]: 3000 }).included.includes('Srinagar: Shikara ride'));

  replaceDestinationCatalog([{ ...edited, enabled_activities: ['Shikara ride'] }, ...original.filter((item) => item.name !== 'Srinagar')]);
  plan = createPlan(input);
  copy = dayNarrative(plan.dayPlans.find((day) => day.stay === 'Srinagar'), input.pickup);
  assert.match(copy, /Shikara ride/);
  assert.equal(plan.dayPlans.filter((day) => dayNarrative(day, input.pickup).includes('Shikara ride')).length, 1);
  const selectedShikara = tripActivities(plan).find((activity) => activity.destination === 'Srinagar' && activity.name === 'Shikara ride');
  assert.equal(selectedShikara.available, true, 'Only ticked activities should be shown in Activities & Transport.');
  const after = calculateCosts(plan, [], { ...baseCost, activityCosts: { [selectedShikara.key]: 3000 } });
  assert.equal(after.activities, 3000);
  assert.ok(clientActivityLists(plan, { [selectedShikara.key]: 3000 }).included.includes('Srinagar: Shikara ride'));
  assert.equal(Math.round(after.sellingTotal - before.sellingTotal), 3465, 'A ticked group activity cost should enter markup and GST once.');

  const custom = validateDestination({ ...edited, id: 'test-custom', name: 'Test Valley', tier: 'Secondary', district: 'Srinagar', day_note: 'Discover the riverside scenery.', srinagar_hours: 2, srinagar_km: 75, things_to_do: [], activities: [], enabled_things_to_do: [], enabled_activities: [] });
  replaceDestinationCatalog([...destinations, custom]);
  assert.equal(routeByName('Srinagar', 'Test Valley').hours, 2);
  const withVisit = setPlanDayTrip(plan, 2, 'Test Valley');
  assert.equal(withVisit.dayPlans[1].dayTripDestination, 'Test Valley');
  assert.match(dayNarrative(withVisit.dayPlans[1], input.pickup), /riverside scenery/);
} finally { replaceDestinationCatalog(original); }
console.log('Destination edits, activity switches, new routes and client-safe day copy passed.');
