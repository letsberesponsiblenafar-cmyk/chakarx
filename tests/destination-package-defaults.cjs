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
const { createPlan } = require('../lib/itinerary.ts');
const { clientActivityLists } = require('../lib/activities.ts');
const { initialPackageDefaults, validatePackageDefaults } = require('../lib/package-defaults.ts');
const input = { name: 'Client', arrival: '2026-10-10', departure: '2026-10-16', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
const srinagar = destinations.find((item) => item.name === 'Srinagar');
const gulmarg = destinations.find((item) => item.name === 'Gulmarg');
const pahalgam = destinations.find((item) => item.name === 'Pahalgam');
const emptyDefaults = { included: [], excluded: [] };
const plan = createPlan(input);
const standard = initialPackageDefaults();
assert.deepEqual(clientActivityLists(plan, {}, {}), standard, 'One common list applies to the entire itinerary.');
assert.deepEqual(clientActivityLists({ dayPlans: [] }, {}, {}), standard, 'Default terms do not depend on how many destinations or sightseeing blocks exist.');
const another = initialPackageDefaults(); another.excluded.length = 0;
assert.equal(initialPackageDefaults().excluded.length, 3, 'Each initial list must be an independent copy.');
assert.ok(destinations.every((item) => item.default_inclusions === undefined && item.default_exclusions === undefined), 'The catalogue no longer seeds per-destination package lists.');
const legacy = enrichDestination({ ...srinagar, default_inclusions: ['Legacy destination promise.'], default_exclusions: ['Legacy destination exclusion.'] });
assert.deepEqual(clientActivityLists(plan, {}, {}, [], [], [legacy]), standard, 'Existing per-destination fields are retained as data but ignored by client package assembly.');
assert.deepEqual(clientActivityLists(plan, {}, {}, [], [], destinations, emptyDefaults), emptyDefaults, 'An explicitly cleared common list stays empty.');

const shared = validatePackageDefaults({ included: ['Welcome hamper.', ' welcome hamper '], excluded: ['Airfare.', 'Rail tickets.'] });
assert.deepEqual(shared.included, ['Welcome hamper.'], 'Case and punctuation duplicates print once.');
assert.deepEqual(clientActivityLists(plan, {}, {}, [], [], destinations, shared), shared, 'Saved common terms replace initial terms for the whole itinerary.');
assert.throws(() => validatePackageDefaults({ included: ['Airfare.'], excluded: ['Flight tickets'] }), /both a default inclusion and exclusion/);
assert.throws(() => validatePackageDefaults({ included: null, excluded: [] }), /must be a list/);
assert.throws(() => validatePackageDefaults({ included: [], excluded: ['x'.repeat(301)] }), /under 300/);
assert.throws(() => validatePackageDefaults({ included: Array(81).fill('Line'), excluded: [] }), /up to 80/);
assert.deepEqual(validatePackageDefaults(emptyDefaults), emptyDefaults);
const flightsIncluded = clientActivityLists(plan, {}, {}, ['Flights'], [], destinations, shared);
assert.ok(flightsIncluded.included.includes('Flights'));
assert.ok(!flightsIncluded.excluded.includes('Airfare.'), 'Explicit flight inclusion overrides the shared airfare default.');
assert.ok(flightsIncluded.excluded.includes('Rail tickets.'), 'Including flights does not imply train tickets.');
assert.ok(!clientActivityLists(plan, {}, {}, ['Rail tickets'], []).excluded.includes('Train tickets.'));

function visitDay(destination, extra = {}) {
  return { day: 1, from: 'Srinagar', to: 'Srinagar', stay: 'Srinagar', dayTripDestination: destination,
    blocks: [{ name: `${destination} stop`, destination, kind: 'sightseeing' }], ...extra };
}
const dayTrip = { dayPlans: [visitDay('Gulmarg')] };
assert.deepEqual(clientActivityLists(dayTrip, {}, {}, [], [], destinations, shared), shared, 'The same common list applies to a single-destination trip.');
const activityCatalogue = [
  { ...gulmarg, activities: ['Horse riding'], enabled_activities: ['Horse riding'] },
  { ...pahalgam, activities: ['Horse riding'], enabled_activities: ['Horse riding'] },
];
const horsePlan = { dayPlans: [visitDay('Gulmarg'), visitDay('Pahalgam', { day: 2 })] };
const gulmargHorse = 'Gulmarg\u001fHorse riding';
const pahalgamHorse = 'Pahalgam\u001fHorse riding';
const horses = clientActivityLists(horsePlan, { [gulmargHorse]: 2000 }, { [gulmargHorse]: true, [pahalgamHorse]: false }, [], [], activityCatalogue,
  { included: ['Pahalgam: Horse riding.'], excluded: ['Gulmarg: Horse riding.'] });
assert.deepEqual(horses.included, ['Gulmarg: Horse riding']);
assert.deepEqual(horses.excluded, ['Pahalgam: Horse riding'], 'Explicit quote decisions beat shared defaults independently in each destination.');
const genericHorseDefault = clientActivityLists(horsePlan, { [gulmargHorse]: 2000 }, { [gulmargHorse]: true, [pahalgamHorse]: false }, [], [], activityCatalogue,
  { included: [], excluded: ['Horse riding charges.'] });
assert.deepEqual(genericHorseDefault, { included: ['Gulmarg: Horse riding'], excluded: ['Pahalgam: Horse riding'] }, 'A generic shared activity clause cannot contradict explicitly included activity in one valley and excluded activity in another.');
const gondolaCatalogue = [{ ...gulmarg, activities: ['Gondola ride'], enabled_activities: ['Gondola ride'] }];
const gondolaKey = 'Gulmarg\u001fGondola ride';
assert.deepEqual(clientActivityLists(dayTrip, { [gondolaKey]: 4500 }, { [gondolaKey]: true }, [], [], gondolaCatalogue,
  { included: [], excluded: ['Gondola ride tickets.', 'Gulmarg: Gondola charges.'] }), { included: ['Gulmarg: Gondola ride'], excluded: [] }, 'Activity charge defaults cannot contradict a priced inclusion.');
const shikaraName = srinagar.activities.find((name) => /sunrise or sunset shikara ride/i.test(name));
assert.ok(shikaraName);
const shikaraCatalogue = destinations.map((item) => ({ ...item, ...(item.name === 'Srinagar' ? { enabled_activities: [shikaraName] } : {}) }));
const shikaraPlan = { dayPlans: [visitDay('Srinagar')] };
const shikaraKey = `Srinagar\u001f${shikaraName}`;
const shikaraDefault = { included: [], excluded: ['Shikara ride charges.'] };
assert.deepEqual(clientActivityLists(shikaraPlan, { [shikaraKey]: 2000 }, { [shikaraKey]: true }, [], [], shikaraCatalogue, shikaraDefault).excluded, [], 'The actual bundled sunrise/sunset Shikara overrides its shorter default charge label.');
assert.deepEqual(clientActivityLists(shikaraPlan, {}, {}, ['Shikara ride'], [], shikaraCatalogue, shikaraDefault).excluded, [], 'An unrelated destination cannot prevent a manual common-term override.');
assert.ok(!clientActivityLists({ dayPlans: [visitDay('Pahalgam')] }, {}, { [pahalgamHorse]: true }, [], [], activityCatalogue,
  { included: ['Pahalgam: Horse riding.'], excluded: [] }).included.length, 'Common defaults must not promise an unpriced activity.');
console.log('Itinerary-wide package defaults, legacy isolation, deduplication and explicit quote overrides passed.');
