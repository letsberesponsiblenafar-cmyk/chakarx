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

const { createPlan, rebuildPlanFromNightSequence, retargetDay, setPlanDayTrip } = require('../lib/itinerary.ts');
const { calculateCosts } = require('../lib/costing.ts');
const { itinerarySnapshot } = require('../components/PlannerProvider.tsx');
const { dayNarrative, dayTitle, sightseeingSentence } = require('../lib/narrative.ts');
const { destinationByName, enabledSightseeing } = require('../lib/data.ts');
const { tripDuration, departureForNights } = require('../lib/trip-dates.ts');
const input = (days) => ({
  name: 'Route QA', arrival: '2026-10-03', departure: `2026-10-${String(days + 2).padStart(2,'0')}`, arrivalTime: '06:00',
  pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature',
  transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'],
});
const visits = (plan) => new Set(plan.dayPlans.flatMap((day) => [day.stay, day.dayTripDestination].filter(Boolean)));
const core = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg'];

const short = createPlan(input(4));
const lateArrival = createPlan({ ...input(4), arrivalTime: '13:00' });
assert.equal(lateArrival.dayPlans[0].dayTripDestination, undefined, 'A late arrival must not promise a long excursion.');
assert.ok(lateArrival.evaluation.alerts.some((alert)=>alert.includes('arrival-day excursion')));
assert.deepEqual(short.dayPlans.slice(0,3).map((day)=>day.stay), ['Srinagar','Srinagar','Srinagar']);
for (const name of core) assert.ok(visits(short).has(name), `Four-day trip missed ${name}`);
assert.ok(short.dayPlans[0].notes.some((note)=>note.includes('early arrival')));
assert.equal(short.dayPlans.at(-1).to, 'Srinagar');

const medium = createPlan(input(8));
for (const name of core) assert.ok(visits(medium).has(name), `Eight-day trip missed ${name}`);
assert.deepEqual(medium.dayPlans.slice(0, -1).map((day) => day.stay), ['Srinagar','Gulmarg','Srinagar','Pahalgam','Srinagar','Sonamarg','Srinagar']);
assert.ok(medium.dayPlans.slice(1, -1).every((day) => day.from === 'Srinagar' || day.stay === 'Srinagar' || day.from === day.stay), 'The suggested route must return through Srinagar between core stays');
for (const name of ['Gulmarg','Pahalgam','Sonamarg']) {
  const arrival = medium.dayPlans.find((day) => day.stay === name);
  const returnDay = medium.dayPlans[arrival.day];
  const first = arrival.blocks.filter((block) => block.destination === name && block.kind !== 'free-time').map((block) => block.name);
  const next = returnDay.blocks.filter((block) => block.destination === name && block.kind !== 'free-time').map((block) => block.name);
  assert.ok(next.length >= 1, `${name} return morning should include a fresh nearby place`);
  assert.ok(next.every((sight) => !first.includes(sight)), `${name} return day repeated its arrival sightseeing`);
}
assert.doesNotMatch(dayNarrative(medium.dayPlans[2], 'Srinagar'), /to Srinagar back through/i);
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
const easyArrivalStops = longTransfer.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind !== 'free-time');
assert.ok(easyArrivalStops.length >= 1 && easyArrivalStops.length <= 2, 'Long arrival transfer should have one or two easy nearby Pahalgam stops');
assert.ok(easyArrivalStops.every((block) => destinationByName('Pahalgam').local_sightseeing
  .find((sight) => sight.name === block.name)?.arrival_suitable === true), 'Arrival stops should stay close to the Pahalgam hotel base');
assert.ok(fullPahalgamDay.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind === 'sightseeing').length >= 3);
for (const major of ['Aru Valley', 'Betaab Valley', 'Chandanwari']) assert.ok(fullPahalgamDay.blocks
  .some((block) => block.destination === 'Pahalgam' && block.name === major), `${major} belongs to the following full Pahalgam day.`);
const allPahalgamStops = twoPahalgamNights.dayPlans.flatMap((day) => day.blocks
  .filter((block) => block.destination === 'Pahalgam' && block.kind === 'sightseeing').flatMap((block) => block.sights || [block.name]));
for (const name of enabledSightseeing(destinationByName('Pahalgam'))) assert.equal(allPahalgamStops
  .filter((stop) => stop === name).length, 1, `${name} must remain selected exactly once across the Pahalgam visit days.`);
assert.doesNotMatch(dayNarrative(longTransfer, 'Srinagar'), /Aru Valley|Betaab Valley|Chandanwari/);
assert.doesNotMatch(dayNarrative(longTransfer, 'Srinagar'), /own pace|rest of the day/i);
assert.match(dayNarrative(longTransfer, 'Srinagar'), /Lidder River|Pahalgam town/i);
assert.match(dayNarrative(longTransfer, 'Srinagar'), /Tangmarg and Srinagar/);
assert.match(dayNarrative(fullPahalgamDay, 'Srinagar'), /Aru Valley|Betaab Valley/);
const handEdited = { ...twoPahalgamNights, dayPlans: twoPahalgamNights.dayPlans.map((day) => day.day === 4 ? { ...day, customTitle: 'Old Pahalgam day', customAbout: 'Old Pahalgam plan.' } : day.day === 1 ? { ...day, customAbout: 'Personal arrival note.' } : day) };
const changedThirdDay = retargetDay(handEdited, 3, 'Sonamarg');
assert.equal(changedThirdDay.dayPlans[3].from, 'Sonamarg', 'Changing an overnight must update the next day’s origin.');
assert.equal(changedThirdDay.dayPlans[3].customAbout, undefined, 'Stale next-day copy must be cleared when its route and sights change.');
assert.notEqual(dayNarrative(changedThirdDay.dayPlans[3], 'Srinagar'), 'Old Pahalgam plan.');
assert.equal(changedThirdDay.dayPlans[0].customAbout, 'Personal arrival note.', 'Unchanged manual day copy should be preserved.');
const shortVisitBase = rebuildPlanFromNightSequence(createPlan(input(8)), Array(7).fill('Srinagar'));
const withNaranagVisit = setPlanDayTrip(shortVisitBase, 6, 'Naranag');
const changedOrigin = rebuildPlanFromNightSequence(withNaranagVisit, ['Srinagar','Srinagar','Srinagar','Pahalgam','Pahalgam','Srinagar','Srinagar']);
assert.equal(changedOrigin.dayPlans[5].from, 'Pahalgam');
assert.notEqual(changedOrigin.dayPlans[5].dayTripDestination, 'Naranag', 'A day visit that becomes too long after the previous night changes must be removed.');

const onePahalgamNight = rebuildPlanFromNightSequence(createPlan(input(5)), ['Srinagar','Gulmarg','Pahalgam','Srinagar']);
const arrivalAtPahalgam = onePahalgamNight.dayPlans[2];
const departureFromPahalgam = onePahalgamNight.dayPlans[3];
const arrivalStops = arrivalAtPahalgam.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind !== 'free-time').map((block) => block.name);
const morningStops = departureFromPahalgam.blocks.filter((block) => block.destination === 'Pahalgam' && block.kind !== 'free-time').map((block) => block.name);
assert.ok(arrivalStops.length >= 1 && arrivalStops.length <= 2, 'A long transfer into a one-night stop should have one or two easy nearby sights');
assert.ok(arrivalStops.every((name) => destinationByName('Pahalgam').local_sightseeing.find((sight) => sight.name === name)?.arrival_suitable === true), 'A long transfer must leave major valley excursions for another day');
assert.ok(morningStops.length >= 1, 'A one-night stop needs sightseeing before the onward drive');
assert.ok(morningStops.every((name) => !arrivalStops.includes(name)), 'The departure morning must show new sights');
for (const name of morningStops) assert.ok(dayNarrative(departureFromPahalgam, 'Srinagar').includes(sightseeingSentence(destinationByName('Pahalgam').local_sightseeing.find((sight) => sight.name === name))), `The return morning missed the authored sentence for ${name}`);

const pahalgamDayTrip = short.dayPlans.find((day) => day.dayTripDestination === 'Pahalgam');
const dayTripSights = pahalgamDayTrip.blocks.find((block) => block.destination === 'Pahalgam' && block.sights)?.sights || [];
assert.ok(dayTripSights.length >= 2, 'A Pahalgam day visit must provide a meaningful sightseeing programme within its round-trip drive time');
for (const name of dayTripSights) {
  assert.ok(dayNarrative(pahalgamDayTrip, 'Srinagar').includes(sightseeingSentence(destinationByName('Pahalgam').local_sightseeing.find((sight) => sight.name === name))), `About this day missed the authored sentence for ${name}`);
}
for (const name of enabledSightseeing(destinationByName('Pahalgam'))) assert.ok(dayTripSights.includes(name),
  `The selected Pahalgam day visit must retain ${name}, even if its estimated duration needs review.`);
const dayTripLoad = pahalgamDayTrip.timing.driveMinutes + pahalgamDayTrip.timing.serviceMinutes + pahalgamDayTrip.timing.scheduledMinutes;
assert.equal(pahalgamDayTrip.timing.remainingMinutes, Math.max(0, pahalgamDayTrip.timing.availableMinutes - dayTripLoad),
  'The day visit must report its complete drive, visit and service time.');
if (dayTripLoad > pahalgamDayTrip.timing.availableMinutes) assert.ok(pahalgamDayTrip.timing.advisories?.length,
  'An overfull selected day visit needs an explicit timing advisory, without silently dropping a place.');
for (const name of ['Aru Valley','Betaab Valley','Chandanwari'].filter((name) => !dayTripSights.includes(name))) {
  assert.ok(!dayNarrative(pahalgamDayTrip, 'Srinagar').includes(name), `The client copy must not promise the unscheduled ${name}`);
}

let repeatedSrinagar = rebuildPlanFromNightSequence(createPlan(input(8)), ['Srinagar','Gulmarg','Srinagar','Pahalgam','Srinagar','Srinagar','Srinagar']);
for (const day of [1,3,5,6,7]) repeatedSrinagar = setPlanDayTrip(repeatedSrinagar, day, null);
const allSrinagarStops = repeatedSrinagar.dayPlans.flatMap((day) => day.blocks.filter((block) => block.destination === 'Srinagar' && block.kind !== 'free-time' && block.kind !== 'departure').map((block) => block.name));
assert.equal(allSrinagarStops.length, new Set(allSrinagarStops).size, 'Separated Srinagar days must not repeat a planned stop');
for (const name of allSrinagarStops) {
  const marker = sightseeingSentence(destinationByName('Srinagar').local_sightseeing.find((sight) => sight.name === name));
  const mentions = repeatedSrinagar.dayPlans.filter((day) => day.label !== 'Departure day' && dayNarrative(day, 'Srinagar').includes(marker)).length;
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
assert.deepEqual(tripDuration('2026-10-10', '2026-10-18'), { days: 9, nights: 8 });
assert.equal(departureForNights('2026-10-10', 6), '2026-10-16');
assert.equal(departureForNights('2028-02-28', 2), '2028-03-01');
assert.equal(tripDuration('2026-10-18', '2026-10-10'), null);
console.log('PASS core visits, transfer-day pacing, unique multi-day sightseeing, day-trip highlights and custom vehicle pricing');
