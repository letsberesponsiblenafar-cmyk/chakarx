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
const { destinations, enrichDestination } = require('../lib/data.ts');
const { validateDestination } = require('../lib/destination-validation.ts');
const { createPlan } = require('../lib/itinerary.ts');
const { clientActivityLists, programmeDestinations } = require('../lib/activities.ts');
const input = { name: 'Client', arrival: '2026-10-10', departure: '2026-10-16', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
const srinagar = destinations.find((item) => item.name === 'Srinagar');
const gulmarg = destinations.find((item) => item.name === 'Gulmarg');
const pahalgam = destinations.find((item) => item.name === 'Pahalgam');
const expectedExclusions = ['Personal expenses such as laundry, shopping and tips.', 'Airfare.', 'Train tickets.'];
const plan = createPlan(input);
const defaults = clientActivityLists(plan, {}, {});
assert.deepEqual(defaults.included, ['Sightseeing as detailed in the day-wise itinerary.'], 'Shared inclusion prints only once across all visited destinations.');
assert.deepEqual(defaults.excluded, expectedExclusions, 'Default exclusions stay short and deduplicate across destinations.');
assert.ok(destinations.every((item) => item.default_inclusions.length === 1 && item.default_exclusions.length === 3), 'Every bundled destination exposes editable package lists.');

const { default_inclusions: omittedInclusions, default_exclusions: omittedExclusions, ...legacy } = srinagar;
assert.deepEqual(enrichDestination(legacy).default_exclusions, expectedExclusions, 'Old database records get defaults without a schema migration.');
assert.deepEqual(enrichDestination({ ...legacy, default_inclusions: [], default_exclusions: [] }).default_exclusions, [], 'An operator clearing a list must not have it resurrected.');
const custom = validateDestination({ ...legacy, id: 'Custom Valley', name: 'Custom Valley', default_inclusions: ['Packed lunch.'], default_exclusions: ['Personal shopping.'] });
assert.deepEqual(custom.default_inclusions, ['Packed lunch.']);
assert.deepEqual(enrichDestination({ ...legacy, id: 'New Valley', name: 'New Valley' }).default_exclusions, expectedExclusions, 'A new destination starts with the same editable short defaults.');
assert.throws(() => validateDestination({ ...legacy, id: 'Srinagar', default_inclusions: ['Airfare.'], default_exclusions: ['Flight tickets'] }), /both a default inclusion and exclusion/);
assert.throws(() => validateDestination({ ...legacy, id: 'Srinagar', default_inclusions: null }), /Default inclusions must be a list/);
assert.throws(() => validateDestination({ ...legacy, id: 'Srinagar', default_exclusions: ['x'.repeat(301)] }), /under 300/);

const flightsIncluded = clientActivityLists(plan, {}, {}, ['Flights'], []);
assert.ok(flightsIncluded.included.includes('Flights'));
assert.ok(!flightsIncluded.excluded.includes('Airfare.'), 'Explicit flight inclusion overrides the matching standard default.');
assert.ok(flightsIncluded.excluded.includes('Train tickets.'), 'Including flights must not imply train tickets are included.');
const trainsIncluded = clientActivityLists(plan, {}, {}, ['Rail tickets'], []);
assert.ok(!trainsIncluded.excluded.includes('Train tickets.'));
assert.ok(trainsIncluded.excluded.includes('Airfare.'));
const catalogue = destinations.map((item) => ({ ...item, default_inclusions: [], default_exclusions: [] }));
assert.deepEqual(clientActivityLists(plan, {}, {}, [], [], catalogue), { included: [], excluded: [] }, 'Cleared defaults preserve the prior explicit-only activity behavior.');

function visitDay(destination, extra = {}) {
  return { day: 1, from: 'Srinagar', to: 'Srinagar', stay: 'Srinagar', dayTripDestination: destination,
    blocks: [{ name: `${destination} stop`, destination, kind: 'sightseeing' }], ...extra };
}
const dayTrip = { dayPlans: [visitDay('Gulmarg')] };
const scoped = [
  { ...srinagar, default_inclusions: ['Unvisited Srinagar clause.'], default_exclusions: [] },
  { ...gulmarg, default_inclusions: ['Gulmarg programme.'], default_exclusions: ['Gulmarg extra.'] },
  { ...pahalgam, default_inclusions: ['Unvisited Pahalgam clause.'], default_exclusions: ['Unvisited Pahalgam extra.'] },
];
assert.deepEqual([...programmeDestinations(dayTrip)], ['Gulmarg']);
assert.deepEqual(clientActivityLists(dayTrip, {}, {}, [], [], scoped), { included: ['Gulmarg programme.'], excluded: ['Gulmarg extra.'] }, 'A hotel base and destinations absent from the programme cannot contribute package terms.');
assert.deepEqual(clientActivityLists({ dayPlans: [visitDay(null, { label: 'Departure day', blocks: [] })] }, {}, {}, [], [], scoped), { included: [], excluded: [] }, 'The airport departure alone adds no library terms.');
const emptyCustomVisit = { dayPlans: [visitDay('Gulmarg', { dayTripDestination: null, from: 'Gulmarg', to: 'Gulmarg', stay: 'Gulmarg', blocks: [] })] };
assert.deepEqual(clientActivityLists(emptyCustomVisit, {}, {}, [], [], scoped), { included: ['Gulmarg programme.'], excluded: ['Gulmarg extra.'] }, 'A selected destination contributes terms even when all Things to Do are currently off.');

const activityCatalogue = [
  { ...gulmarg, activities: ['Horse riding'], enabled_activities: ['Horse riding'], default_inclusions: [], default_exclusions: ['Horse riding.'] },
  { ...pahalgam, activities: ['Horse riding'], enabled_activities: ['Horse riding'], default_inclusions: ['Horse riding.'], default_exclusions: [] },
];
const horsePlan = { dayPlans: [visitDay('Gulmarg'), visitDay('Pahalgam', { day: 2 })] };
const gulmargHorse = 'Gulmarg\u001fHorse riding';
const pahalgamHorse = 'Pahalgam\u001fHorse riding';
const horses = clientActivityLists(horsePlan, { [gulmargHorse]: 2000 }, { [gulmargHorse]: true, [pahalgamHorse]: false }, [], [], activityCatalogue);
assert.deepEqual(horses.included, ['Gulmarg: Horse riding']);
assert.deepEqual(horses.excluded, ['Pahalgam: Horse riding'], 'Matching paid/unticked decisions beat defaults independently in each destination.');
const gondolaCatalogue = [{ ...gulmarg, activities: ['Gondola ride'], enabled_activities: ['Gondola ride'], default_inclusions: [], default_exclusions: ['Gondola ride tickets.', 'Gulmarg: Gondola charges.'] }];
const gondolaKey = 'Gulmarg\u001fGondola ride';
assert.deepEqual(clientActivityLists(dayTrip, { [gondolaKey]: 4500 }, { [gondolaKey]: true }, [], [], gondolaCatalogue), { included: ['Gulmarg: Gondola ride'], excluded: [] }, 'Known activity ticket/charge wording cannot contradict its priced inclusion.');
const shikaraName = srinagar.activities.find((name) => /sunrise or sunset shikara ride/i.test(name));
assert.ok(shikaraName, 'The regression must exercise the actual bundled Srinagar activity name.');
const shikaraCatalogue = destinations.map((item) => ({ ...item, default_inclusions: [], default_exclusions: item.name === 'Srinagar' ? ['Shikara ride charges.'] : [], ...(item.name === 'Srinagar' ? { enabled_activities: [shikaraName] } : {}) }));
const shikaraPlan = { dayPlans: [visitDay('Srinagar')] };
const shikaraKey = `Srinagar\u001f${shikaraName}`;
assert.deepEqual(clientActivityLists(shikaraPlan, { [shikaraKey]: 2000 }, { [shikaraKey]: true }, [], [], shikaraCatalogue).excluded, [], 'Actual sunrise/sunset Shikara quote overrides its short default charge label.');
const manualShikara = clientActivityLists(shikaraPlan, {}, {}, ['Shikara ride'], [], shikaraCatalogue);
assert.deepEqual(manualShikara.excluded, [], 'An unrelated valley’s similar activity must not block a manual inclusion override.');
const noPrice = clientActivityLists({ dayPlans: [visitDay('Pahalgam')] }, {}, { [pahalgamHorse]: true }, [], [], activityCatalogue);
assert.ok(!noPrice.included.length, 'A library default must not promise a selected activity whose price is still missing.');
const disagreeing = scoped.map((item) => ({ ...item, default_inclusions: item.name === 'Gulmarg' ? ['Welcome dinner.'] : [], default_exclusions: item.name === 'Pahalgam' ? ['welcome dinner'] : [] }));
assert.deepEqual(clientActivityLists(horsePlan, {}, {}, [], [], disagreeing), { included: [], excluded: ['welcome dinner'] }, 'Conflicting library defaults never print a service on both sides.');
console.log('Destination package defaults, persistence, scope, deduplication and explicit quote overrides passed.');
