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


const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip, reschedulePlan } = require('../lib/itinerary.ts');
const { destinations, destinationByName, replaceDestinationCatalog, enabledSightseeing } = require('../lib/data.ts');
const { dayNarrative } = require('../lib/narrative.ts');
const original = [...destinations];
const input = (count, overrides = {}) => ({ name: 'Balanced programme', arrival: '2026-10-13',
  departure: new Date(Date.UTC(2026, 9, 13 + count - 1)).toISOString().slice(0, 10),
  arrivalTime: '09:00', departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0,
  hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'], ...overrides });
const sights = (day) => day.blocks.filter((block) => block.kind === 'sightseeing').flatMap((block) =>
  (block.librarySights || []).map((sight) => `${sight.destination}:${sight.name}`));
const visits = (plan) => new Set(plan.dayPlans.flatMap((day) => [day.stay, day.dayTripDestination].filter(Boolean)));
const capacity = (day) => day.timing.availableMinutes - day.timing.driveMinutes - day.timing.serviceMinutes;
let checks = 0;
function test(name, run) { replaceDestinationCatalog(original); run(); checks++; console.log(`PASS ${name}`); }

// Exercise the same scheduler used by the planner and client narrative.
function runChecks() {
try {
  test('eight days combine two valley stays with Sonamarg and an additional day trip', () => {
    const plan = createPlan(input(8));
    for (const name of ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Naranag']) assert.ok(visits(plan).has(name), name);
    for (const name of ['Gulmarg', 'Pahalgam']) assert.ok(plan.hotelPlans.some((stay) => stay.location === name));
    assert.equal(plan.dayPlans.filter((day) => day.dayTripDestination).length, 2);
    assert.ok(plan.dayPlans.slice(1, -1).every((day) => day.from === 'Srinagar' || day.stay === 'Srinagar' || day.from === day.stay));
  });
  test('longer routes retain variety while upgrading excursions to overnight stays', () => {
    const nine = createPlan(input(9)), ten = createPlan(input(10)), eleven = createPlan(input(11));
    assert.ok(nine.hotelPlans.some((stay) => stay.location === 'Sonamarg'));
    for (const name of visits(nine)) assert.ok(visits(ten).has(name), `Ten days lost ${name}`);
    assert.ok(visits(ten).has('Doodhpathri'));
    for (const name of visits(ten)) assert.ok(visits(eleven).has(name), `Eleven days lost ${name}`);
    assert.ok(eleven.hotelPlans.some((stay) => stay.location === 'Doodhpathri'));
  });
  test('real valley programmes use the best achievable consecutive library split and flag unavoidable overload', () => {
    const plan = createPlan(input(9));
    for (const name of ['Gulmarg', 'Pahalgam', 'Sonamarg']) {
      const pair = plan.dayPlans.filter((day) => sights(day).some((key) => key.startsWith(`${name}:`)));
      assert.equal(pair.length, 2);
      const guide = destinationByName(name);
      const selected = new Set(enabledSightseeing(guide));
      const places = guide.local_sightseeing.filter((place) => selected.has(place.name));
      assert.deepEqual(pair.flatMap(sights).filter((key) => key.startsWith(`${name}:`)), places.map((place) => `${name}:${place.name}`),
        `${name}: balancing must retain chronological library order and every selected source exactly once`);
      // Only a boundary between consecutive library entries is a valid split.
      // A single long visit can make the former arbitrary-stop balance impossible.
      const prefixes = [0];
      for (const place of places) {
        assert.ok(Number.isFinite(place.visit_minutes) && Number.isFinite(place.transfer_minutes),
          `${name}: this fixture must have explicit visit and movement estimates`);
        prefixes.push(prefixes.at(-1) + place.visit_minutes + place.transfer_minutes);
      }
      const total = prefixes.at(-1);
      const bestDifference = Math.min(...prefixes.map((first) => Math.abs(first - (total - first))));
      assert.ok(Math.abs(pair[0].timing.scheduledMinutes - pair[1].timing.scheduledMinutes) <= Math.max(120, bestDifference),
        `${name}: ${pair.map((day) => day.timing.scheduledMinutes).join('/')}`);
      const bestOverrun = Math.min(...prefixes.map((first) => Math.max(0, first - capacity(pair[0]))
        + Math.max(0, total - first - capacity(pair[1]))));
      const actualOverrun = pair.reduce((sum, day) => sum + Math.max(0, day.timing.scheduledMinutes - capacity(day)), 0);
      assert.ok(actualOverrun <= bestOverrun, `${name} needlessly overfilled a day: ${actualOverrun} minutes instead of ${bestOverrun}`);
      for (const day of pair.filter((day) => day.timing.scheduledMinutes > capacity(day))) {
        assert.ok(day.timing.advisories.some((message) => /selected places.*included.*review/i.test(message)),
          `${name}: unavoidable ordered-programme overload must expose a review advisory`);
      }
    }
  });
  test('late-departure city time shares visits after airport buffers; early departure stays clear', () => {
    const late = createPlan(input(9));
    const guide = destinationByName('Srinagar');
    const checked = new Set(enabledSightseeing(guide));
    const expectedOrder = guide.local_sightseeing.filter((place) => checked.has(place.name)).map((place) => `Srinagar:${place.name}`);
    const assertCityOrder = (plan) => assert.deepEqual(plan.dayPlans.flatMap(sights).filter((key) => key.startsWith('Srinagar:')), expectedOrder,
      'Airport-time sharing must not reorder, drop or repeat selected city places');
    // The library's final place is a dawn-only market. Preserving that order
    // may leave just this visit for departure rather than moving earlier stops.
    assert.ok(sights(late.dayPlans.at(-1)).length >= 1);
    assertCityOrder(late);
    assert.ok(late.dayPlans.at(-1).timing.scheduledMinutes <= capacity(late.dayPlans.at(-1)));
    if (late.dayPlans[0].timing.scheduledMinutes > capacity(late.dayPlans[0])) {
      assert.ok(late.dayPlans[0].timing.advisories.some((message) => /selected places.*included.*review/i.test(message)),
        'Order/window-constrained arrival overload must expose a review advisory');
    }
    for (const departureTime of ['12:00', '13:00', '14:00', '16:00']) {
      const plan = createPlan(input(9, { departureTime }));
      const departure = plan.dayPlans.at(-1);
      assert.ok(departure.timing.scheduledMinutes <= capacity(departure), `${departureTime}: sightseeing runs into airport reporting`);
      assertCityOrder(plan);
    }
    for (const departureTime of ['08:00', undefined]) {
      const plan = createPlan(input(9, { departureTime }));
      assert.equal(sights(plan.dayPlans.at(-1)).length, 0);
      assert.equal(plan.dayPlans.at(-2).stay, 'Srinagar');
      assertCityOrder(plan);
    }
  });
  test('checked places and authored sentences survive once; unchecked places stay absent', () => {
    const guide = destinationByName('Pahalgam');
    const unchecked = guide.local_sightseeing.at(-1);
    replaceDestinationCatalog(original.map((item) => item.name === guide.name ? { ...item,
      enabled_sightseeing: enabledSightseeing(item).filter((name) => name !== unchecked.name) } : item));
    const plan = createPlan(input(9));
    const assigned = plan.dayPlans.flatMap(sights);
    const text = plan.dayPlans.map((day) => dayNarrative(day, 'Srinagar')).join(' ');
    for (const name of visits(plan)) {
      const destination = destinationByName(name);
      for (const sight of destination.local_sightseeing.filter((sight) => enabledSightseeing(destination).includes(sight.name))) {
        assert.equal(assigned.filter((key) => key === `${name}:${sight.name}`).length, 1, `${name}: ${sight.name}`);
        assert.equal(text.split(sight.client_sentence).length - 1, 1, sight.name);
      }
    }
    assert.ok(!text.includes(unchecked.client_sentence));
  });
  test('repeated days share visits by available time including an already priced experience', () => {
    const stops = Array.from({ length: 12 }, (_, index) => ({ name: `Balanced stop ${index + 1}`, description: '',
      client_sentence: `Explore balanced stop ${index + 1}.`, tags: [], visit_minutes: 50, transfer_minutes: 10,
      arrival_suitable: index < 2 }));
    replaceDestinationCatalog(original.map((item) => item.name === 'Pahalgam' ? { ...item, local_sightseeing: stops,
      enabled_sightseeing: stops.map((stop) => stop.name), activities: ['Private valley experience'],
      enabled_activities: ['Private valley experience'], activity_timing: { 'Private valley experience': { duration_minutes: 180 } },
      activity_copy: { 'Private valley experience': 'Enjoy a private valley experience.' } } : item));
    let plan = rebuildPlanFromNightSequence(createPlan(input(6)), ['Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar', 'Srinagar']);
    const key = 'Pahalgam\u001fPrivate valley experience';
    plan = reschedulePlan(plan, { activityCosts: { [key]: 3000 }, activitySelections: { [key]: true } });
    const days = plan.dayPlans.slice(1, 4);
    assert.ok(days.every((day) => sights(day).filter((key) => key.startsWith('Pahalgam:')).length >= 2));
    const loads = days.map((day) => day.timing.scheduledMinutes / capacity(day));
    assert.ok(Math.max(...loads) - Math.min(...loads) < 0.3, loads.join('/'));
    assert.equal(days.flatMap((day) => day.scheduledActivities).filter((activity) => activity.key === key).length, 1);
    assert.equal(new Set(plan.dayPlans.flatMap(sights)).size, plan.dayPlans.flatMap(sights).length);
  });
  test('manual day-visit choices survive rescheduling and results are deterministic', () => {
    const plan = setPlanDayTrip(createPlan(input(8)), 7, 'Doodhpathri');
    const next = reschedulePlan(plan);
    assert.equal(next.dayPlans[6].dayTripDestination, 'Doodhpathri');
    assert.deepEqual(reschedulePlan(next), next);
  });
  test('a return-day visit selector can choose the city or the previous overnight destination explicitly', () => {
    const plan = createPlan(input(8));
    const returnDay = plan.dayPlans[2];
    assert.equal(returnDay.from, 'Gulmarg');
    assert.equal(returnDay.stay, 'Srinagar');
    const cityVisit = setPlanDayTrip(plan, 3, 'Srinagar');
    assert.equal(cityVisit.dayPlans[2].dayTripDestination, 'Srinagar');
    const citySights = sights(cityVisit.dayPlans[2]);
    assert.ok(citySights.length && citySights.every((key) => key.startsWith('Srinagar:')));
    const valleyVisit = setPlanDayTrip(cityVisit, 3, 'Gulmarg');
    assert.equal(valleyVisit.dayPlans[2].dayTripDestination, 'Gulmarg');
    const valleySights = sights(valleyVisit.dayPlans[2]);
    assert.ok(valleySights.length && valleySights.every((key) => key.startsWith('Gulmarg:')));
    assert.equal(valleyVisit.dayPlans[3].from, 'Srinagar');
  });
  test('2–31 days and every travel style keep exact nights, continuity and departure protection', () => {
    for (const style of ['Relaxed', 'Balanced', 'Packed']) for (let count = 2; count <= 31; count++) {
      const plan = createPlan(input(count, { style, departureTime: '13:00' }));
      assert.equal(plan.dayPlans.length, count);
      assert.equal(plan.hotelPlans.reduce((total, hotel) => total + hotel.nights, 0), count - 1);
      assert.equal(plan.dayPlans.at(-2).stay, 'Srinagar');
      for (let i = 1; i < count; i++) assert.equal(plan.dayPlans[i].from, plan.dayPlans[i - 1].stay);
      const assigned = plan.dayPlans.flatMap(sights);
      assert.equal(new Set(assigned).size, assigned.length, `${style}/${count} repeats a selected visit`);
    }
  });
} finally { replaceDestinationCatalog(original); }
console.log(`Planner balance checks passed: ${checks}.`);
}

runChecks();

