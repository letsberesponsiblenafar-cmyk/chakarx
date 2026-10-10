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
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};

const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip } = require('../lib/itinerary.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { dayNarrative, dayTitle } = require('../lib/narrative.ts');
const input = (days) => ({
  name: 'Route QA', arrival: '2026-10-03', departure: `2026-10-${String(days + 2).padStart(2,'0')}`,
  pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature',
  transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'],
});
const visits = (plan) => new Set(plan.dayPlans.flatMap((day) => [day.stay, day.dayTripDestination].filter(Boolean)));
const core = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg'];

const short = createPlan(input(4));
assert.deepEqual(short.dayPlans.slice(0,3).map((day)=>day.stay), ['Srinagar','Srinagar','Srinagar']);
for (const name of core) assert.ok(visits(short).has(name), `Four-day trip missed ${name}`);
assert.ok(short.dayPlans[0].notes.some((note)=>note.includes('early arrival')));
assert.equal(short.dayPlans.at(-1).to, 'Srinagar');

const medium = createPlan(input(8));
for (const name of [...core,'Doodhpathri','Naranag']) assert.ok(visits(medium).has(name), `Eight-day trip missed ${name}`);
assert.ok(medium.dayPlans.some((day)=>day.stay==='Pahalgam'));
assert.ok(!dayTitle(medium.dayPlans.find((day)=>day.stay==='Pahalgam'), 'Srinagar').includes('Pahalgam local sightseeing'));

const long = createPlan(input(11));
for (const name of [...core,'Doodhpathri','Naranag']) assert.ok(visits(long).has(name), `Eleven-day trip missed ${name}`);
for (const name of ['Gulmarg','Sonamarg','Pahalgam']) assert.ok(long.dayPlans.some((day)=>day.stay===name), `Long trip lacks ${name} overnight`);
assert.equal(long.dayPlans.at(-1).to, 'Srinagar');
const extended = createPlan(input(16));
for (const name of core) assert.ok(visits(extended).has(name), `Sixteen-day trip missed ${name}`);
assert.ok(visits(extended).size >= 6, 'Sixteen-day trip needs a varied destination circuit');

const twoPahalgamNights = rebuildPlanFromNightSequence(createPlan(input(7)), ['Srinagar','Gulmarg','Pahalgam','Pahalgam','Srinagar','Srinagar']);
const longTransfer = twoPahalgamNights.dayPlans[2];
const fullPahalgamDay = twoPahalgamNights.dayPlans[3];
assert.ok(longTransfer.drive.hours >= 4, 'Gulmarg to Pahalgam should be treated as a long transfer');
assert.equal(longTransfer.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind !== 'free-time').length, 0, 'Long arrival transfer must reserve major Pahalgam sightseeing for the next day');
assert.ok(fullPahalgamDay.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind === 'sightseeing').length >= 3);
assert.doesNotMatch(dayNarrative(longTransfer, 'Srinagar'), /Aru Valley|Betaab Valley|Chandanwari/);
assert.match(dayNarrative(fullPahalgamDay, 'Srinagar'), /Aru Valley|Betaab Valley/);

const onePahalgamNight = createPlan(input(5));
const arrivalAtPahalgam = onePahalgamNight.dayPlans[2];
const departureFromPahalgam = onePahalgamNight.dayPlans[3];
const arrivalStops = arrivalAtPahalgam.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind !== 'free-time').map((block) => block.name);
const morningStops = departureFromPahalgam.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind !== 'free-time').map((block) => block.name);
assert.ok(arrivalStops.length <= 1, 'A long transfer into a one-night stop should have at most one easy sight');
assert.ok(morningStops.length >= 1, 'A one-night stop needs sightseeing before the onward drive');
assert.ok(morningStops.every((name) => !arrivalStops.includes(name)), 'The departure morning must show new sights');
for (const name of morningStops) assert.ok(dayNarrative(departureFromPahalgam, 'Srinagar').includes(name));

const pahalgamDayTrip = short.dayPlans.find((day) => day.dayTripDestination === 'Pahalgam');
const dayTripSights = pahalgamDayTrip.blocks.find((block) => block.destination === 'Pahalgam' && block.sights)?.sights || [];
for (const name of ['Aru Valley','Betaab Valley','Chandanwari']) {
  assert.ok(dayTripSights.includes(name), `The one-day Pahalgam excursion missed ${name}`);
  assert.ok(dayNarrative(pahalgamDayTrip, 'Srinagar').includes(name), `About this day missed ${name}`);
}

let repeatedSrinagar = rebuildPlanFromNightSequence(createPlan(input(8)), ['Srinagar','Gulmarg','Srinagar','Pahalgam','Srinagar','Srinagar','Srinagar']);
for (const day of [1,3,5,6,7]) repeatedSrinagar = setPlanDayTrip(repeatedSrinagar, day, null);
const allSrinagarStops = repeatedSrinagar.dayPlans.flatMap((day) => day.blocks.filter((block) => block.destination === 'Srinagar' && block.kind !== 'free-time' && block.kind !== 'departure').map((block) => block.name));
assert.equal(allSrinagarStops.length, new Set(allSrinagarStops).size, 'Separated Srinagar days must not repeat a planned stop');
for (const name of allSrinagarStops) {
  const mentions = repeatedSrinagar.dayPlans.filter((day) => day.label !== 'Departure day' && dayNarrative(day, 'Srinagar').includes(name)).length;
  assert.equal(mentions, 1, `${name} should appear in only one About this day section`);
}

const customVehicle = 'Luxury minibus';
const customPlan = createPlan({ ...input(4), transport: customVehicle });
const customCost = { transportDaily: 6100, transportIsCustom: true, activityCosts: {}, otherAmount: 0, profitPct: 10 };
const customQuote = calculateCosts(customPlan, [], customCost);
assert.equal(customQuote.transport, customPlan.dayPlans.length * 6100, 'Custom daily vehicle rate must reach the quote');
const saved = JSON.parse(JSON.stringify(itinerarySnapshot({ input: customPlan.input, plan: customPlan, routeVersion: null, hotelSelections: [], hotelDatabase: [], costModel: customCost, hotelDefaults: {}, generated: true, savedItineraryId: null })));
assert.equal(saved.input.transport, customVehicle, 'Saved itinerary must retain the custom vehicle name');
assert.equal(saved.costModel.transportDaily, 6100, 'Saved itinerary must retain the custom vehicle rate');
console.log('PASS core visits, transfer-day pacing, unique multi-day sightseeing, day-trip highlights and custom vehicle pricing');
