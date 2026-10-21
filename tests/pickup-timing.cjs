const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
const { createPlan, arrivalDayVisitAllowed, rebuildPlanFromNightSequence, reschedulePlan } = require('../lib/itinerary.ts');
const { journeyDrive } = require('../lib/journey-drive.ts');
const { dayVisitDestination } = require('../lib/journey-labels.ts');
const { dayTimingForReview, pickupTimingNotice, scheduleDayPlans } = require('../lib/day-scheduler.ts');
const { quoteReadiness, hotelConfirmationSignature } = require('../lib/quote-readiness.ts');
const input = { name: 'Pickup QA', arrival: '2026-11-01', departure: '2026-11-06', arrivalTime: '06:00', departureTime: '18:00', pickup: 'Jammu', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast Only', style: 'Balanced', interests: [] };
const model = { transportDaily: 3000, transportIsCustom: false, mealPerPersonNight: 0, activityBudget: 0, activityCosts: {}, activitySelections: {}, manualInclusions: [], manualExclusions: [], contingencyPct: 0, profitPct: 10, otherAmount: 0 };
const missing = 'Set a road distance and drive time for this route in the destination library.';
function hotels(plan) { return plan.hotelPlans.map((stay) => {
  const hotel = { location: stay.location, hotelId: '', hotelName: `${stay.location} Custom Hotel`, category: 'Signature', starRating: null, address: '', roomType: 'Double', website: '', nights: stay.nights, rooms: 1, extraBeds: 0, cnb: 0, nightlyRate: 2500, extraBedRate: 0, cnbRate: 0, source: 'Custom hotel', status: 'user-edited', rateConfirmed: true };
  hotel.confirmedSignature = hotelConfirmationSignature(plan, hotel, plan.input.mealPlan); return hotel;
}); }
function readiness(plan) { return quoteReadiness(plan, plan.input, hotels(plan), model, [], 'ready', 'ready'); }
function legacy(plan) {
  const clone = JSON.parse(JSON.stringify(plan));
  Object.assign(clone.dayPlans[0].drive, { km: 0, hours: 0, known: false, source: 'Live routing required' });
  clone.dayPlans[0].timing.issues = [missing];
  clone.dayPlans[0].timing.driveMinutes = 0;
  return clone;
}
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
check('Jammu has a measured road-transfer estimate, in both directions', () => {
  for (const [from, to] of [['Jammu','Srinagar'], ['Srinagar','Jammu']]) {
    const drive = journeyDrive(from, to);
    assert.equal(drive.known, true); assert.equal(drive.km, 290); assert.equal(drive.hours, 7); assert.equal(drive.live_required, true);
  }
  const composed = journeyDrive('Jammu','Gulmarg');
  assert(composed.known); assert(composed.hours > 7); assert(composed.via.includes('Srinagar'));
});
check('Jammu arrival reserves the transfer and never adds the Srinagar-only early excursion', () => {
  for (const time of ['', '06:00', '15:00', '23:00']) for (let nights = 1; nights <= 30; nights++) {
    const departure = new Date(Date.UTC(2026, 10, 1 + nights)).toISOString().slice(0,10);
    const plan = createPlan({ ...input, departure, arrivalTime: time }); const day = plan.dayPlans[0];
    assert.equal(day.drive.known, true); assert.equal(day.timing.driveMinutes, 420);
    assert.equal(dayVisitDestination(day), day.stay, 'Pickup is not a sightseeing destination.');
    assert(!day.dayTripDestination); assert(!day.timing.issues.includes(missing));
    assert(!day.timing.issues.some((issue) => /transfers.*exceed/.test(issue)));
    assert(day.timing.availableMinutes >= day.timing.driveMinutes + day.timing.serviceMinutes);
  }
});
check('late Jammu pickup visibly warns about after-midnight check-in', () => {
  const day = createPlan({ ...input, arrivalTime: '23:00' }).dayPlans[0];
  assert(day.timing.advisories.some((message) => /after midnight/.test(message)));
});
check('only a verified Srinagar arrival qualifies for the existing early-arrival excursion', () => {
  assert.equal(arrivalDayVisitAllowed({ ...input, pickup: 'Srinagar' }, 'Gulmarg'), true);
  for (const pickup of ['Jammu', 'Other', 'Custom railway station']) assert.equal(arrivalDayVisitAllowed({ ...input, pickup }, 'Gulmarg'), false);
});
check('unknown custom pickup is a visible advisory and never a PDF-readiness blocker', () => {
  for (const pickup of ['Other', 'Katra railway station', 'Client hotel lobby']) {
    const plan = createPlan({ ...input, pickup }); const day = plan.dayPlans[0];
    assert.equal(day.drive.known, false);
    assert(pickupTimingNotice(day, plan.input).includes(pickup));
    assert(day.timing.advisories.some((message) => message.includes(pickup)));
    assert.deepEqual(readiness(plan), [], 'A complete custom-pickup quote can be downloaded.');
  }
});
check('saved custom pickup diagnostics are repaired without rewriting any saved content', () => {
  const plan = legacy(createPlan({ ...input, pickup: 'Client hotel lobby' })); const before = JSON.stringify(plan);
  const timing = dayTimingForReview(plan.dayPlans[0], plan.input);
  assert(!timing.issues.includes(missing)); assert(timing.advisories.some((message) => message.includes('Client hotel lobby')));
  assert.deepEqual(readiness(plan), []);
  assert.equal(JSON.stringify(plan), before);
});
check('saved Jammu quotes get corrected pickup diagnostics without changing the saved programme', () => {
  const plan = legacy(createPlan(input)); const before = JSON.stringify(plan);
  const timing = dayTimingForReview(plan.dayPlans[0], plan.input);
  assert.equal(timing.driveMinutes, 420); assert(!timing.issues.includes(missing));
  assert.deepEqual(readiness(plan), []); assert.equal(JSON.stringify(plan), before);
});
check('unknown inter-destination routes and forbidden custom routes still block sharing', () => {
  const plan = createPlan({ ...input, pickup: 'Custom station' });
  plan.dayPlans[1].drive.known = false; plan.dayPlans[1].timing.issues = [missing];
  assert(readiness(plan).some((issue) => issue === `Day 2: ${missing}`));
  const first = { ...plan.dayPlans[0], drive: { ...plan.dayPlans[0].drive, preference: 'NOT_ALLOWED' } };
  const scheduled = scheduleDayPlans(plan.input, [first]);
  assert(scheduled[0].timing.issues.some((issue) => /not permitted/.test(issue)));
});
check('a missing route from the standard Srinagar pickup is not mistaken for a custom pickup', () => {
  const plan = legacy(createPlan({ ...input, pickup: 'Srinagar' }));
  assert.equal(pickupTimingNotice(plan.dayPlans[0], plan.input), null);
  assert(readiness(plan).some((issue) => issue === `Day 1: ${missing}`));
});
check('replanning and rescheduling retain the Jammu transfer and independent hotel-day count', () => {
  const plan = rebuildPlanFromNightSequence(createPlan(input), ['Gulmarg','Srinagar','Srinagar','Pahalgam','Srinagar']);
  const after = reschedulePlan(plan, model);
  assert(after.dayPlans[0].drive.known); assert(after.dayPlans[0].drive.hours > 7);
  assert.equal(after.nights, plan.nights); assert.equal(after.dayPlans.length, plan.dayPlans.length);
});
console.log(`Pickup timing: ${passed} checks passed (including 120 Jammu date/time combinations).`);
