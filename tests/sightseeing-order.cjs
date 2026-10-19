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

const { destinations, replaceDestinationCatalog } = require('../lib/data.ts');
const { scheduleDayPlans, dayScheduleContext } = require('../lib/day-scheduler.ts');
const { dayNarrative } = require('../lib/narrative.ts');
const original = [...destinations];
const emptyQuote = { activityCosts: {}, activitySelections: {} };
const input = { name: 'Library sightseeing order regression', arrival: '2026-10-20', departure: '2026-10-25',
  arrivalTime: '09:00', departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0,
  hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
let checks = 0;
const failures = [];

function test(name, run) {
  try { replaceDestinationCatalog(original); run(); checks++; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push({ name, error }); process.stderr.write(`FAIL ${name}: ${error.message}\n`); }
}
function sight(name, options = {}) {
  return { name, description: '', client_sentence: `Visit ${name}.`, tags: [], season: 'all',
    visit_minutes: 45, transfer_minutes: 10, arrival_suitable: true, ...options };
}
function select(destination, places, enabled = places.map((place) => place.name)) {
  replaceDestinationCatalog(original.map((guide) => ({ ...guide, local_sightseeing: [], enabled_sightseeing: [],
    activities: [], enabled_activities: [], activity_copy: {}, activity_timing: {},
    day_note: `Discover the scenery of ${guide.name}.`,
    ...(guide.name === destination ? { local_sightseeing: places, enabled_sightseeing: enabled } : {}),
  })));
}
function day(destination, number = 2, overrides = {}) {
  return { day: number, date: `2026-10-${19 + number}`, label: 'Sightseeing day', from: destination, to: destination,
    stay: destination, transfer: false, drive: { from: destination, to: destination, km: 0, hours: 0,
      known: true, preference: 'ALLOWED' }, blocks: [], notes: [], scheduledActivities: [], ...overrides };
}
function schedule(days, trip = {}) { return scheduleDayPlans({ ...input, ...trip }, days, emptyQuote); }
function sourceNames(days, destination) {
  return days.flatMap((item) => item.blocks.filter((block) => block.kind === 'sightseeing')
    .flatMap((block) => (block.librarySights || []).filter((source) => source.destination === destination).map((source) => source.name)));
}
function assertCopyOrder(days, places) {
  const text = days.map((item) => dayNarrative(item, 'Srinagar', emptyQuote)).join(' ');
  let previous = -1;
  for (const place of places) {
    const position = text.indexOf(place.client_sentence);
    assert.ok(position > previous, `${place.name} is missing or appears before its preceding library place.`);
    assert.equal(text.split(place.client_sentence).length - 1, 1, `${place.name} must have its selected sentence exactly once.`);
    previous = position;
  }
}
function assertSequence(days, destination, places) {
  assert.deepEqual(sourceNames(days, destination), places.map((place) => place.name),
    'Chronological sightseeing must follow the displayed library sequence, with every selected place exactly once.');
  assertCopyOrder(days, places);
}
function persistedSourceContext(day) {
  // b75381c tracked library source text, but not its later-added order field.
  // Build that persisted shape explicitly instead of using the new default.
  const context = JSON.parse(dayScheduleContext(day));
  for (const block of context[11]) if (Array.isArray(block[4])) {
    block[4] = block[4].map((source) => source.slice(0, 5));
  }
  return JSON.stringify(context);
}

try {
  test('one day retains library order despite checkbox click order, durations, arrival flags and visit windows', () => {
    const places = [sight('First library riverside', { visit_minutes: 20 }),
      sight('Second library valley', { visit_minutes: 180, arrival_suitable: false }),
      sight('Third library dawn viewpoint', { visit_minutes: 30, arrival_suitable: false, time_window: { start: 360, end: 480 } }),
      sight('Fourth library garden', { visit_minutes: 60 })];
    select('Srinagar', places, places.map((place) => place.name).reverse());
    assertSequence(schedule([day('Srinagar')]), 'Srinagar', places);
  });

  test('two repeated visit days share consecutive library places in chronological order', () => {
    const places = Array.from({ length: 10 }, (_, index) => sight(`Two-day library stop ${index + 1}`,
      { visit_minutes: index % 3 === 0 ? 140 : 80, arrival_suitable: index % 2 === 0 }));
    select('Pahalgam', places);
    const result = schedule([day('Pahalgam'), day('Pahalgam', 3)]);
    assertSequence(result, 'Pahalgam', places);
    assert.ok(result.every((item) => sourceNames([item], 'Pahalgam').length > 0), 'Both available visit days should share this programme.');
  });

  test('three repeated visit days preserve the complete chronological library sequence', () => {
    const places = Array.from({ length: 12 }, (_, index) => sight(`Three-day library stop ${index + 1}`,
      { visit_minutes: 170, arrival_suitable: index % 3 === 0 }));
    select('Sonamarg', places, places.map((place) => place.name).reverse());
    const result = schedule([day('Sonamarg'), day('Sonamarg', 3), day('Sonamarg', 4)]);
    assertSequence(result, 'Sonamarg', places);
    assert.ok(result.every((item) => sourceNames([item], 'Sonamarg').length > 0), 'All three available days should share this longer programme.');
  });

  test('unticking and rechecking a place restores its library position rather than appending it', () => {
    const places = ['First checked grove', 'Second checked terrace', 'Third checked meadow', 'Fourth checked viewpoint'].map((name) => sight(name));
    const remaining = [places[0], places[2], places[3]];
    select('Pahalgam', places, remaining.map((place) => place.name));
    const before = schedule([day('Pahalgam')]);
    assertSequence(before, 'Pahalgam', remaining);
    assert.ok(!dayNarrative(before[0], 'Srinagar', emptyQuote).includes(places[1].client_sentence));
    select('Pahalgam', places, [...remaining.map((place) => place.name), places[1].name]);
    assertSequence(schedule(before), 'Pahalgam', places);
  });

  test('a day-trip wrapper keeps sightseeing names and client copy in library order', () => {
    const places = [sight('Excursion first meadow', { visit_minutes: 30 }), sight('Excursion second ridge', { visit_minutes: 160, arrival_suitable: false }),
      sight('Excursion third riverside', { visit_minutes: 60 })];
    select('Sonamarg', places);
    const result = schedule([day('Srinagar', 2, { dayTripDestination: 'Sonamarg' })]);
    const wrapper = result[0].blocks.find((block) => block.name === 'Sonamarg day trip');
    assert.ok(wrapper, 'The explicit day trip should retain its wrapper.');
    assert.deepEqual(wrapper.sights, places.map((place) => place.name));
    assertSequence(result, 'Sonamarg', places);
  });

  test('an unchanged ordered programme retains approved manual About text', () => {
    const places = ['Approved first stop', 'Approved second stop', 'Approved third stop'].map((name) => sight(name));
    select('Pahalgam', places);
    const result = schedule([day('Pahalgam')]);
    result[0].customAbout = 'An approved client-specific valley programme.';
    result[0].customAboutContext = dayScheduleContext(result[0]);
    const unchanged = schedule(result);
    assert.equal(unchanged[0].customAbout, result[0].customAbout);
    assert.equal(dayNarrative(unchanged[0], 'Srinagar', emptyQuote), result[0].customAbout);
  });

  test('reordering the library invalidates manual About and archives its previous text', () => {
    const places = [sight('Reorder first library stop', { visit_minutes: 20 }), sight('Reorder second library stop', { visit_minutes: 160 }),
      sight('Reorder third library stop', { visit_minutes: 50 })];
    select('Pahalgam', places);
    const result = schedule([day('Pahalgam')]);
    result[0].customAbout = 'The original manually approved sequence.';
    result[0].customAboutContext = dayScheduleContext(result[0]);
    const reordered = [places[2], places[0], places[1]];
    select('Pahalgam', reordered, places.map((place) => place.name));
    const changed = schedule(result);
    assert.equal(changed[0].customAbout, undefined, 'A changed source sequence must regenerate outdated manual copy.');
    assert.equal(changed[0].previousCustomAbout, result[0].customAbout, 'Keep the previous manual text available for review.');
    assertSequence(changed, 'Pahalgam', reordered);
  });

  test('interleaved checked aliases retain authored sentence order without repeating the physical lake visit', () => {
    const places = [sight('Dal Lake & Boulevard', { client_sentence: 'Walk along the lake boulevard with the guide.' }),
      sight('Nishat Bagh', { client_sentence: 'Explore the terraced garden and its fountains.' }),
      sight('Dal Lake', { client_sentence: 'Pause at the waterfront for the final lake panorama.' })];
    select('Srinagar', places);
    const result = schedule([day('Srinagar')]);
    assertCopyOrder(result, places);
    const physical = result.flatMap((item) => item.blocks.filter((block) => block.kind === 'sightseeing'));
    assert.equal(physical.length, 2, 'Aliases should remain one physical lake visit plus the separate garden visit.');
    assert.deepEqual([...sourceNames(result, 'Srinagar')].sort(), places.map((place) => place.name).sort(),
      'Physical deduplication must retain every checked source record.');
  });

  test('a sole dawn visit still waits for a suitable local morning rather than an evening arrival or early departure', () => {
    const market = sight('Ordered morning market', { visit_minutes: 60, transfer_minutes: 15, arrival_suitable: false,
      time_window: { start: 360, end: 480 } });
    select('Srinagar', [market]);
    const result = schedule([day('Srinagar', 1), day('Srinagar'), day('Srinagar', 3, { label: 'Departure day' })],
      { arrivalTime: '20:00', departureTime: '08:00' });
    assert.deepEqual(sourceNames([result[0]], 'Srinagar'), []);
    assert.deepEqual(sourceNames([result[1]], 'Srinagar'), [market.name]);
    assert.deepEqual(sourceNames([result[2]], 'Srinagar'), []);
    assert.ok(result[1].timing.startMinutes >= 360 && result[1].timing.startMinutes < 480);
  });

  test('persisted pre-order wrapper context upgrades approved text, but a later source reorder regenerates it', () => {
    const places = [sight('Persisted excursion first stop'), sight('Persisted excursion second stop')];
    select('Sonamarg', places);
    const saved = schedule([day('Srinagar', 2, { dayTripDestination: 'Sonamarg' })]);
    saved[0].customAbout = 'A client-approved excursion programme saved before library-order tracking.';
    saved[0].customAboutContext = persistedSourceContext(saved[0]);
    assert.notEqual(saved[0].customAboutContext, dayScheduleContext(saved[0]), 'The fixture must use the old persisted schema.');
    const upgraded = schedule(saved);
    assert.equal(upgraded[0].customAbout, saved[0].customAbout, 'A fingerprint upgrade alone must not discard an unchanged approved wrapper.');
    assert.equal(upgraded[0].customAboutContext, dayScheduleContext(upgraded[0]), 'The approved draft must upgrade to the current source-order fingerprint.');
    const reordered = [places[1], places[0]];
    select('Sonamarg', reordered);
    const changed = schedule(upgraded);
    assert.equal(changed[0].customAbout, undefined, 'An actual later library reorder must regenerate the programme.');
    assert.equal(changed[0].previousCustomAbout, saved[0].customAbout, 'Keep the approved previous text available for review.');
    assertSequence(changed, 'Sonamarg', reordered);
    const changedBeforeUpgrade = schedule(saved);
    assert.equal(changedBeforeUpgrade[0].customAbout, undefined, 'The old context schema must not conceal a reorder made before its first refresh.');
    assert.equal(changedBeforeUpgrade[0].previousCustomAbout, saved[0].customAbout);
  });

  test('persisted pre-order adjacent-alias context retains approved text without hiding a later alias reorder', () => {
    const places = [sight('Dal Lake & Boulevard', { client_sentence: 'Begin with a guided walk on the boulevard.' }),
      sight('Dal Lake', { client_sentence: 'Pause by the lake for the client-requested photograph.' }),
      sight('Nishat Bagh', { client_sentence: 'Continue to the terraced garden after the lake visit.' })];
    select('Srinagar', places);
    const saved = schedule([day('Srinagar')]);
    saved[0].customAbout = 'An approved lake visit and garden programme saved with adjacent aliases.';
    saved[0].customAboutContext = persistedSourceContext(saved[0]);
    assert.notEqual(saved[0].customAboutContext, dayScheduleContext(saved[0]), 'The merged-source fixture must use the old persisted schema.');
    const upgraded = schedule(saved);
    assert.equal(upgraded[0].customAbout, saved[0].customAbout, 'Unchanged adjacent aliases must not invalidate approved wording during migration.');
    assert.equal(upgraded[0].customAboutContext, dayScheduleContext(upgraded[0]));
    assert.equal(upgraded[0].blocks.filter((block) => block.kind === 'sightseeing').length, 2, 'Context migration must retain physical deduplication.');
    const reordered = [places[1], places[0], places[2]];
    select('Srinagar', reordered);
    const changed = schedule(upgraded);
    assert.equal(changed[0].customAbout, undefined, 'A real change in alias source order must invalidate old manual wording.');
    assert.equal(changed[0].previousCustomAbout, saved[0].customAbout);
    assertCopyOrder(changed, reordered);
    assert.equal(changed[0].blocks.filter((block) => block.kind === 'sightseeing').length, 2);
    const changedBeforeUpgrade = schedule(saved);
    assert.equal(changedBeforeUpgrade[0].customAbout, undefined, 'A source alias reorder before migration must not be treated as a harmless schema upgrade.');
    assert.equal(changedBeforeUpgrade[0].previousCustomAbout, saved[0].customAbout);
  });

  test('a shared stop owned by a later excursion explicitly warns when source-library order cannot be honored', () => {
    const shared = sight('Nishat Bagh', { client_sentence: 'First visit the city garden.' });
    const city = sight('Unique city stop', { client_sentence: 'Second visit the city monument.' });
    const excursion = sight('Nishat Bagh', { client_sentence: 'Explore the garden with the excursion guide.' });
    replaceDestinationCatalog(original.map((guide) => ({ ...guide, local_sightseeing: [], enabled_sightseeing: [],
      activities: [], enabled_activities: [], activity_copy: {}, activity_timing: {},
      ...(guide.name === 'Srinagar' ? { local_sightseeing: [shared, city], enabled_sightseeing: [shared.name, city.name] } : {}),
      ...(guide.name === 'Mughal Gardens Cluster' ? { local_sightseeing: [excursion], enabled_sightseeing: [excursion.name] } : {}),
    })));
    const result = schedule([day('Srinagar', 2), day('Srinagar', 3, { dayTripDestination: 'Mughal Gardens Cluster' })]);
    assert.deepEqual(sourceNames([result[0]], 'Srinagar'), [city.name], 'The separate city visit must retain its valid route day.');
    assert.deepEqual(sourceNames([result[1]], 'Srinagar'), [shared.name], 'The explicit excursion must keep ownership of its shared physical stop.');
    const physical = result.flatMap((item) => item.blocks.filter((block) => block.kind === 'sightseeing')
      .flatMap((block) => block.sights === undefined ? [block.name] : block.sights));
    assert.equal(physical.filter((name) => name === shared.name).length, 1, 'Resolving a source-order conflict must not repeat the physical visit.');
    for (const item of result) assert.ok(item.timing.advisories.some((message) => /library order/i.test(message) && /shared/i.test(message)),
      `Day ${item.day} must flag the shared-stop library-order conflict instead of silently claiming to follow the source order.`);
    const text = result.map((item) => dayNarrative(item, 'Srinagar', emptyQuote)).join(' ');
    for (const place of [shared, city, excursion]) assert.equal(text.split(place.client_sentence).length - 1, 1,
      'The explicit order advisory must not remove or repeat an authored source sentence.');
  });
} finally { replaceDestinationCatalog(original); }

if (failures.length) {
  for (const { name, error } of failures) process.stderr.write(`\n${name}\n${error.stack}\n`);
  process.exitCode = 1;
} else process.stdout.write(`Sightseeing library order checks passed: ${checks}.\n`);
