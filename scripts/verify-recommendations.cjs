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

const { createPlan } = require('../lib/itinerary.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { dayTitle } = require('../lib/narrative.ts');
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
const customVehicle = 'Luxury minibus';
const customPlan = createPlan({ ...input(4), transport: customVehicle });
const customCost = { transportDaily: 6100, transportIsCustom: true, activityCosts: {}, otherAmount: 0, profitPct: 10 };
const customQuote = calculateCosts(customPlan, [], customCost);
assert.equal(customQuote.transport, customPlan.dayPlans.length * 6100, 'Custom daily vehicle rate must reach the quote');
const saved = JSON.parse(JSON.stringify(itinerarySnapshot({ input: customPlan.input, plan: customPlan, routeVersion: null, hotelSelections: [], hotelDatabase: [], costModel: customCost, hotelDefaults: {}, generated: true, savedItineraryId: null })));
assert.equal(saved.input.transport, customVehicle, 'Saved itinerary must retain the custom vehicle name');
assert.equal(saved.costModel.transportDaily, 6100, 'Saved itinerary must retain the custom vehicle rate');
console.log('PASS core visits on 4/8/11/16-day trips, Srinagar day-trip hub, longer overnight circuit and sightseeing wording');
