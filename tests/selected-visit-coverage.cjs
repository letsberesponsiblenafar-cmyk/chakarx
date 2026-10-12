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
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};

const { destinations, destinationByName, enabledSightseeing, replaceDestinationCatalog } = require('../lib/data.ts');
const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip, reschedulePlan } = require('../lib/itinerary.ts');
const { scheduleDayPlans } = require('../lib/day-scheduler.ts');
const { dayNarrative } = require('../lib/narrative.ts');
const original = [...destinations];
const quote = { activityCosts: {}, activitySelections: {} };
const failures = [];
let checks = 0;
const key = (destination, name) => `${destination}\u001f${name}`;
function test(name, run) {
  try { replaceDestinationCatalog(original); run(); checks++; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push({ name, error }); process.stderr.write(`FAIL ${name}: ${error.message}\n`); }
}
function winterPlan(visits = { 6: 'Sonamarg' }) {
  const input = { name: 'Winter Sonamarg regression', arrival: '2026-12-14', departure: '2026-12-20',
    arrivalTime: '09:00', departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0,
    hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
  let plan = rebuildPlanFromNightSequence(createPlan(input), Array(6).fill('Srinagar'));
  for (let day = 1; day <= 6; day++) plan = setPlanDayTrip(plan, day, visits[day] || null);
  return reschedulePlan(plan, quote);
}
function stops(day) {
  return day.blocks.filter((block) => block.kind === 'sightseeing')
    .flatMap((block) => (block.sights === undefined ? [block.name] : block.sights)
      .map((name) => key(block.destination, name)));
}
function assertCoverage(plan, destination) {
  const guide = destinationByName(destination);
  const selected = new Set(enabledSightseeing(guide));
  const assigned = plan.dayPlans.flatMap(stops);
  for (const sight of guide.local_sightseeing) {
    const occurrences = assigned.filter((value) => value === key(destination, sight.name));
    assert.equal(occurrences.length, selected.has(sight.name) ? 1 : 0,
      `${destination}: ${sight.name} must follow the library tick exactly once.`);
    const day = plan.dayPlans.find((item) => stops(item).includes(key(destination, sight.name)));
    if (day) assert.ok(dayNarrative(day, 'Srinagar', quote).includes(sight.client_sentence),
      `${destination}: the assigned ${sight.name} sentence is missing from About This Day.`);
  }
}

try {
  test('19 December Sonamarg day visit uses the same selected places as its legacy library ticks', () => {
    const guide = destinationByName('Sonamarg');
    assert.equal(guide.enabled_sightseeing, undefined, 'This must exercise the real legacy bundled record.');
    assert.equal(enabledSightseeing(guide).length, 7);
    const plan = winterPlan();
    const day = plan.dayPlans[5];
    assert.equal(day.date, '2026-12-19');
    assert.equal(day.dayTripDestination, 'Sonamarg');
    assert.equal(day.stay, 'Srinagar');
    assert.ok(day.timing.scheduledMinutes > 0, 'Selected sightseeing cannot become 0 minutes because the date is December.');
    assertCoverage(plan, 'Sonamarg');
  });

  test('the legacy tick fallback is honored for other operator-chosen winter destinations', () => {
    const plan = winterPlan({ 2: 'Gulmarg', 3: 'Pahalgam', 4: 'Doodhpathri', 6: 'Sonamarg' });
    for (const name of ['Gulmarg', 'Pahalgam', 'Doodhpathri', 'Sonamarg']) assertCoverage(plan, name);
  });

  test('every destination retains checked legacy places while preserving route access reviews', () => {
    const catalog = original.map((item) => ({ ...item,
      local_sightseeing: [{ name: `${item.name} operator-selected viewpoint`, description: '', tags: [],
        client_sentence: `Visit the selected viewpoint in ${item.name}.`, season: 'late-spring-summer-autumn',
        visit_minutes: 45, transfer_minutes: 15 }], enabled_sightseeing: undefined,
      activities: [], enabled_activities: [], activity_copy: {}, activity_timing: {},
    }));
    replaceDestinationCatalog(catalog);
    for (const guide of destinations) {
      // Isolate the shared availability rule from destination recommendation,
      // road-endpoint and trek-length policies, which are covered separately.
      const input = { arrival: '2026-12-14', departure: '2026-12-20', pickup: 'Srinagar' };
      const originalDay = { day: 6, date: '2026-12-19', label: 'Sightseeing day', from: 'Srinagar',
        to: 'Srinagar', stay: 'Srinagar', transfer: false, dayTripDestination: guide.name,
        drive: { from: 'Srinagar', to: 'Srinagar', km: 80, hours: 2, known: true, preference: 'ALLOWED' },
        blocks: [], notes: [], scheduledActivities: [] };
      const [day] = scheduleDayPlans(input, [originalDay], quote);
      const selectedKey = key(guide.name, guide.local_sightseeing[0].name);
      assert.equal(stops(day).filter((value) => value === selectedKey).length, 1,
        `${guide.name} applied a conflicting availability rule.`);
      assert.ok(dayNarrative(day, 'Srinagar', quote).includes(guide.local_sightseeing[0].client_sentence),
        `${guide.name} omitted its checked place from About This Day.`);
      if (guide.name === 'Gurez') assert.ok(day.timing.issues.some((issue) => issue.includes('May–October')),
        'Preserving the selected place must not conceal the Gurez access review.');
    }
  });

  test('two Sonamarg visits divide all selected places without repeating their sentences', () => {
    const plan = winterPlan({ 4: 'Sonamarg', 6: 'Sonamarg' });
    assertCoverage(plan, 'Sonamarg');
    for (const number of [4, 6]) assert.ok(stops(plan.dayPlans[number - 1]).length > 0, `Day ${number} is an empty repeated visit.`);
    const copy = plan.dayPlans.map((day) => dayNarrative(day, 'Srinagar', quote)).join(' ');
    for (const sight of destinationByName('Sonamarg').local_sightseeing) {
      assert.equal(copy.split(sight.client_sentence).length - 1, 1, `${sight.name} repeats in client copy.`);
    }
  });

  test('an explicit operator tick list still excludes unticked places during winter', () => {
    const guide = destinationByName('Sonamarg');
    const enabled = [guide.local_sightseeing[0].name, guide.local_sightseeing[4].name, guide.local_sightseeing[5].name];
    replaceDestinationCatalog(original.map((item) => item.name === guide.name ? { ...item, enabled_sightseeing: enabled } : item));
    const plan = winterPlan();
    assertCoverage(plan, 'Sonamarg');
    const copy = dayNarrative(plan.dayPlans[5], 'Srinagar', quote);
    for (const sight of guide.local_sightseeing.filter((item) => !enabled.includes(item.name))) {
      assert.ok(!copy.includes(sight.client_sentence), `Unticked ${sight.name} was inserted into client copy.`);
    }
  });

  test('an explicitly empty operator list does not invent sightseeing or a paid activity', () => {
    const guide = destinationByName('Sonamarg');
    replaceDestinationCatalog(original.map((item) => item.name === guide.name ? { ...item, enabled_sightseeing: [] } : item));
    const plan = winterPlan();
    assert.deepEqual(stops(plan.dayPlans[5]), []);
    assert.deepEqual(plan.dayPlans[5].scheduledActivities, []);
  });

  test('reloading an older saved empty Sonamarg day regenerates its selected programme', () => {
    const stored = JSON.parse(JSON.stringify(winterPlan()));
    const day = stored.dayPlans[5];
    day.blocks = [{ destination: 'Sonamarg', name: 'Sonamarg day trip', description: 'Day visit to Sonamarg.',
      kind: 'sightseeing', reason: '', tags: [], sights: [], intelligence: { status: 'STANDARD' } }];
    day.primaryVisitFor = [];
    day.scheduledActivities = [];
    day.timing.scheduledMinutes = 0;
    const restored = reschedulePlan(stored, quote);
    assertCoverage(restored, 'Sonamarg');
    assert.ok(restored.dayPlans[5].timing.scheduledMinutes > 0);
    assert.match(dayNarrative(restored.dayPlans[5], 'Srinagar', quote), /Sonamarg.*meadow/i);
  });
} finally { replaceDestinationCatalog(original); }

if (failures.length) {
  console.error(`${failures.length} selected-visit regression(s) failed; ${checks} passed.`);
  process.exitCode = 1;
} else console.log(`Selected-visit coverage passed: ${checks} regressions.`);
