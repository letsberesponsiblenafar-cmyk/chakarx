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
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};

const { createPlan, rebuildPlanFromNightSequence, reschedulePlan, retargetDay, setPlanDayTrip,
  setPlanDeparturePoint, requiresSrinagarFinalNight } = require('../lib/itinerary.ts');
const input = { name: 'Departure policy QA', arrival: '2026-10-15', departure: '2026-10-18',
  arrivalTime: '08:00', departureTime: '18:30', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0,
  hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };

for (const departureTime of ['00:00', '11:59', '12:00', '13:59', '14:00']) {
  assert.equal(requiresSrinagarFinalNight({ departureTime }), true, `${departureTime} must require Srinagar.`);
}
for (const departureTime of ['14:01', '18:30', undefined, '', 'invalid']) {
  assert.equal(requiresSrinagarFinalNight({ departureTime }), false, `${departureTime} must not invent an early-departure rule.`);
}

const late = rebuildPlanFromNightSequence(createPlan(input), ['Srinagar', 'Gulmarg', 'Pahalgam']);
assert.equal(late.dayPlans[2].stay, 'Pahalgam', 'Late departure may keep an outlying final hotel.');
const oldEarly = { ...late, input: { ...late.input, departureTime: '13:00' } };
const originalJSON = JSON.stringify(oldEarly);
const repaired = reschedulePlan(oldEarly);
assert.equal(JSON.stringify(oldEarly), originalJSON, 'Repair must not mutate the saved source snapshot.');
assert.equal(repaired.dayPlans[2].stay, 'Srinagar');
assert.equal(repaired.dayPlans[2].dayTripDestination, 'Pahalgam', 'The former final base must remain a day visit.');
assert.equal(repaired.dayPlans[3].from, 'Srinagar');
assert.equal(repaired.dayPlans[3].transfer, false);
assert.equal(repaired.dayPlans[3].departureTime, '13:00');
assert.equal(repaired.hotelPlans.find((stay) => stay.location === 'Srinagar').nights, 2);
assert.ok(!repaired.hotelPlans.some((stay) => stay.location === 'Pahalgam'), 'No removed hotel night may remain in hotel plans.');
assert.equal(repaired.hotelPlans.reduce((sum, stay) => sum + stay.nights, 0), 3);
assert.equal(repaired.days, 4);
assert.deepEqual(reschedulePlan(repaired), repaired, 'Restoring/rechecking repeatedly must be stable.');

assert.throws(() => retargetDay(repaired, 3, 'Gulmarg'), /final overnight in Srinagar/);
assert.equal(retargetDay(repaired, 2, 'Sonamarg').dayPlans[1].stay, 'Sonamarg', 'Only the compulsory last night is locked.');
assert.equal(setPlanDayTrip(oldEarly, 3, 'Gulmarg').dayPlans[2].stay, 'Srinagar');
assert.equal(setPlanDayTrip(oldEarly, 3, 'Gulmarg').dayPlans[2].dayTripDestination, 'Gulmarg');
assert.equal(setPlanDeparturePoint(oldEarly, 'Srinagar').dayPlans.at(-1).from, 'Srinagar');

const explicitVisit = setPlanDayTrip(late, 3, 'Sonamarg');
const repairedVisit = reschedulePlan({ ...explicitVisit, input: { ...explicitVisit.input, departureTime: '12:00' } });
assert.equal(repairedVisit.dayPlans[2].stay, 'Srinagar');
assert.equal(repairedVisit.dayPlans[2].dayTripDestination, 'Sonamarg', 'Changing a hotel base must preserve an explicit excursion.');

for (const departureTime of ['14:00', '14:01']) {
  const plan = rebuildPlanFromNightSequence(createPlan({ ...input, departureTime }), ['Srinagar', 'Gulmarg', 'Pahalgam']);
  assert.equal(plan.dayPlans[2].stay, departureTime === '14:00' ? 'Srinagar' : 'Pahalgam');
}
const overnight = rebuildPlanFromNightSequence(createPlan({ ...input, departure: '2026-10-16', departureTime: '08:00' }), ['Sonamarg']);
assert.equal(overnight.nights, 1);
assert.equal(overnight.dayPlans[0].stay, 'Srinagar');
assert.equal(overnight.dayPlans[0].dayTripDestination, 'Sonamarg');

const edited = JSON.parse(JSON.stringify(oldEarly));
edited.dayPlans[2].customAbout = 'An old Pahalgam hotel description.';
const refreshed = reschedulePlan(edited);
assert.equal(refreshed.dayPlans[2].customAbout, undefined);
assert.equal(refreshed.dayPlans[2].previousCustomAbout, 'An old Pahalgam hotel description.');

console.log('Departure cutoff, mandatory final stay, saved-route repair, hotel nights, route edits and repeated restore checks passed.');
