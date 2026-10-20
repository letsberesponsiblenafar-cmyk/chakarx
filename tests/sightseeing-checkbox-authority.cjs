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

const { destinations, destinationByName, replaceDestinationCatalog } = require('../lib/data.ts');
const { scheduleDayPlans, dayScheduleContext } = require('../lib/day-scheduler.ts');
const { dayNarrative } = require('../lib/narrative.ts');
const original = [...destinations];
const failures = [];
let checks = 0;
const emptyQuote = { activityCosts: {}, activitySelections: {} };
const input = { name: 'Checkbox authority regression', arrival: '2026-12-18', departure: '2026-12-22',
  arrivalTime: '09:00', departureTime: '18:00', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0,
  hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
const key = (destination, name) => `${destination}\u001f${name}`;

function test(name, run) {
  try { replaceDestinationCatalog(original); run(); checks++; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push({ name, error }); process.stderr.write(`FAIL ${name}: ${error.message}\n`); }
}
function sight(name, options = {}) {
  return { name, description: '', client_sentence: `Visit ${name}.`, tags: [], season: 'late-spring-summer-autumn',
    visit_minutes: 45, transfer_minutes: 10, arrival_suitable: true, ...options };
}
function catalog(overrides) {
  replaceDestinationCatalog(original.map((destination) => ({ ...destination,
    local_sightseeing: [], enabled_sightseeing: [], activities: [], enabled_activities: [],
    activity_copy: {}, activity_timing: {}, day_note: `Discover the scenery of ${destination.name}.`,
    ...(overrides[destination.name] || {}),
  })));
}
function select(name, sights, enabled = sights.map((item) => item.name), extra = {}) {
  catalog({ [name]: { local_sightseeing: sights, enabled_sightseeing: enabled, ...extra } });
}
function day(name, overrides = {}) {
  return { day: 2, date: '2026-12-19', label: 'Sightseeing day', from: name, to: name, stay: name,
    transfer: false, drive: { from: name, to: name, km: 0, hours: 0, known: true, preference: 'ALLOWED' },
    blocks: [], notes: [], scheduledActivities: [], ...overrides };
}
function schedule(days, quote = emptyQuote, trip = {}) {
  return scheduleDayPlans({ ...input, ...trip }, days, quote);
}
function copy(days, quote = emptyQuote) {
  return days.map((item) => dayNarrative(item, 'Srinagar', quote)).join(' ');
}
function assertSelectedCopy(days, selected, unchecked = [], quote = emptyQuote) {
  const text = copy(days, quote);
  for (const item of selected) assert.equal(text.split(item.client_sentence).length - 1, 1,
    `${item.name} must have its checked planned sentence exactly once in About This Day.`);
  for (const item of unchecked) assert.ok(!text.includes(item.client_sentence),
    `${item.name} is unticked and must not acquire a client sightseeing sentence.`);
}

try {
  const constrainedCases = [
      ['late arrival', 'Sonamarg', { day: 1, date: input.arrival }, { arrivalTime: '23:00' }],
      ['early departure', 'Srinagar', { day: 3, label: 'Departure day', date: input.departure }, { departureTime: '08:00' }],
      ['unknown route', 'Pahalgam', { drive: { from: 'Srinagar', to: 'Pahalgam', km: 90, hours: 3, known: false, preference: 'ALLOWED' } }],
      ['prohibited route', 'Gulmarg', { drive: { from: 'Srinagar', to: 'Gulmarg', km: 52, hours: 3, known: true, preference: 'NOT_ALLOWED' } }],
      ['winter access window', 'Gurez', {}],
      ['missed dawn window', 'Srinagar', { day: 1, date: input.arrival }, { arrivalTime: '14:00' }, { time_window: { start: 4 * 60, end: 6 * 60 } }],
      ['oversized visit duration', 'Sonamarg', {}, {}, { visit_minutes: 2000 }],
  ];
  for (const [reason, name, overrides, trip, options] of constrainedCases) {
    test(`${reason} review cannot silently remove a checked sightseeing sentence`, () => {
      const chosen = sight(`${name} checked ${reason} viewpoint`, options);
      const unchecked = sight(`${name} unchecked ${reason} viewpoint`);
      select(name, [chosen, unchecked], [chosen.name]);
      assertSelectedCopy(schedule([day(name, overrides)], emptyQuote, trip), [chosen], [unchecked]);
    });
  }

  test('every destination follows its operator checkboxes without a second seasonal gate', () => {
    for (const destination of original) {
      const chosen = sight(`${destination.name} selected viewpoint`);
      const unchecked = sight(`${destination.name} excluded viewpoint`);
      select(destination.name, [chosen, unchecked], [chosen.name]);
      assertSelectedCopy(schedule([day(destination.name)]), [chosen], [unchecked]);
    }
  });

  test('the checked garden circuit keeps its authored sentence alongside checked named gardens', () => {
    const places = ['Mughal Gardens & Zabarwan foothills', 'Pari Mahal', 'Nishat Bagh', 'Shalimar Bagh', 'Chashme Shahi'].map((name) => sight(name));
    select('Srinagar', places);
    assertSelectedCopy(schedule([day('Srinagar')]), places);
  });

  test('a priced linked experience cannot replace a different checked sightseeing sentence', () => {
    const chosen = sight('Sentinel viewpoint', { requires_activity: 'Guided viewpoint walk' });
    const activity = 'Guided viewpoint walk';
    const authoredActivity = 'Enjoy a guided walk around Sentinel viewpoint.';
    select('Sonamarg', [chosen], [chosen.name], { activities: [activity], enabled_activities: [activity],
      activity_copy: { [activity]: authoredActivity }, activity_timing: { [activity]: { duration_minutes: 60, sight_names: [chosen.name] } } });
    const quote = { activityCosts: { [key('Sonamarg', activity)]: 1000 }, activitySelections: { [key('Sonamarg', activity)]: true } };
    const result = schedule([day('Sonamarg')], quote);
    assertSelectedCopy(result, [chosen], [], quote);
    assert.ok(copy(result, quote).includes(authoredActivity), 'The separately priced activity must retain its own sentence.');
  });

  test('generated sightseeing excludes unticked places and follows the introduction', () => {
    const chosen = sight('Checked woodland walk');
    const unchecked = sight('Unticked palace');
    select('Srinagar', [chosen, unchecked], [chosen.name], {
      day_note: 'Discover Srinagar.',
      day_note_mode: 'auto',
    });
    const result = schedule([day('Srinagar')]);
    assertSelectedCopy(result, [chosen], [unchecked]);
    assert.ok(!copy(result).includes('Unticked palace'), 'General destination text must not reintroduce a deselected place.');
  });

  test('manual About text survives an unchanged programme and updates when checkboxes change', () => {
    const first = sight('First selected grove');
    const second = sight('Second selected grove');
    select('Pahalgam', [first, second], [first.name]);
    const result = schedule([day('Pahalgam')]);
    result[0].customAbout = 'A client-approved morning in the valley.';
    const same = schedule(result);
    assert.equal(same[0].customAbout, result[0].customAbout);
    select('Pahalgam', [first, second], [second.name]);
    const changed = schedule(same);
    assert.equal(changed[0].customAbout, undefined, 'Changed ticks must not leave an outdated manual programme active.');
    assert.equal(changed[0].previousCustomAbout, result[0].customAbout, 'Keep the previous manual copy available for review.');
    assertSelectedCopy(changed, [second], [first]);
  });

  test('multiple destination days divide the checked programme without repeats', () => {
    const places = Array.from({ length: 12 }, (_, index) => sight(`Sonamarg selected stop ${index + 1}`, { visit_minutes: 180 }));
    const unchecked = sight('Sonamarg unticked stop');
    select('Sonamarg', [...places, unchecked], places.map((item) => item.name));
    const result = schedule([day('Sonamarg'), day('Sonamarg', { day: 3, date: '2026-12-20' })]);
    assertSelectedCopy(result, places, [unchecked]);
    for (const item of result) assert.ok(item.blocks.some((block) => block.kind === 'sightseeing'), 'A repeated destination day should share the programme.');
  });

  test('overlapping checked place records keep both authored sentences within one physical visit', () => {
    const first = sight('Dal Lake & Boulevard', { client_sentence: 'Walk the lakeside boulevard beside Dal Lake.' });
    const second = sight('Dal Lake', { client_sentence: 'Pause at the Dal Lake waterfront for mountain views.' });
    select('Srinagar', [first, second]);
    const result = schedule([day('Srinagar')]);
    assertSelectedCopy(result, [first, second]);
    assert.equal(result.flatMap((item) => item.blocks.filter((block) => block.kind === 'sightseeing')).length, 1,
      'Overlapping records should describe one physical stop rather than repeat the visit.');
  });

  test('an unchecked alias contributes no sentence to an overlapping checked place', () => {
    const chosen = sight('Dal Lake & Boulevard', { client_sentence: 'Walk the checked lakeside boulevard.' });
    const unchecked = sight('Dal Lake', { client_sentence: 'Stop at the unticked Dal Lake viewpoint.' });
    select('Srinagar', [chosen, unchecked], [chosen.name]);
    assertSelectedCopy(schedule([day('Srinagar')]), [chosen], [unchecked]);
  });

  test('an explicit excursion owns an overlapping stop and retains both checked source sentences', () => {
    const city = sight('Pari Mahal', { client_sentence: 'Walk through Pari Mahal’s historic terraces.' });
    const excursion = sight('Pari Mahal', { client_sentence: 'Pause at Pari Mahal for its elevated lake panorama.' });
    catalog({
      Srinagar: { local_sightseeing: [city], enabled_sightseeing: [city.name] },
      'Mughal Gardens Cluster': { local_sightseeing: [excursion], enabled_sightseeing: [excursion.name] },
    });
    const result = schedule([day('Srinagar'), day('Srinagar', { day: 3, date: '2026-12-20', dayTripDestination: 'Mughal Gardens Cluster' })]);
    assertSelectedCopy(result, [city, excursion]);
    assert.ok(!dayNarrative(result[0], 'Srinagar', emptyQuote).includes(city.client_sentence),
      'The city arrival must not repeat the physical stop assigned to the explicit garden excursion.');
    const excursionCopy = dayNarrative(result[1], 'Srinagar', emptyQuote);
    assert.ok(excursionCopy.includes(city.client_sentence) && excursionCopy.includes(excursion.client_sentence),
      'Both checked source details must remain together on the explicit destination visit.');
  });

  test('changing a merged source checkbox invalidates manual About inside a day-trip wrapper', () => {
    const city = sight('Pari Mahal', { client_sentence: 'Walk through Pari Mahal’s historic terraces.' });
    const excursion = sight('Pari Mahal', { client_sentence: 'Pause at Pari Mahal for its elevated lake panorama.' });
    const overrides = {
      Srinagar: { local_sightseeing: [city], enabled_sightseeing: [city.name] },
      'Mughal Gardens Cluster': { local_sightseeing: [excursion], enabled_sightseeing: [excursion.name] },
    };
    catalog(overrides);
    const result = schedule([day('Srinagar'), day('Srinagar', { day: 3, date: '2026-12-20', dayTripDestination: 'Mughal Gardens Cluster' })]);
    assertSelectedCopy(result, [city, excursion]);
    result[1].customAbout = 'A manually approved garden excursion including the city-specific terrace visit.';
    result[1].customAboutContext = dayScheduleContext(result[1]);
    const unchanged = schedule(result);
    assert.equal(unchanged[1].customAbout, result[1].customAbout, 'An unchanged wrapped programme must retain manual edits.');
    catalog({ ...overrides, Srinagar: { ...overrides.Srinagar, enabled_sightseeing: [] } });
    const changed = schedule(unchanged);
    assert.equal(changed[1].customAbout, undefined, 'Unticking a merged source must invalidate its stale manually edited programme.');
    assert.equal(changed[1].previousCustomAbout, result[1].customAbout, 'Preserve the stale manual text for operator review.');
    assertSelectedCopy(changed, [excursion], [city]);
  });

  test('legacy EXTRA, OPTIONAL and EXCLUDED statuses cannot override checked sightseeing', () => {
    const statuses = ['EXTRA', 'OPTIONAL', 'EXCLUDED'];
    const places = statuses.map((status) => sight(`${status} status checked viewpoint`));
    const unchecked = sight('Legacy unchecked viewpoint');
    select('Gulmarg', [...places, unchecked], places.map((item) => item.name));
    const legacy = day('Gulmarg', { blocks: [...places, unchecked].map((item, index) => ({
      name: item.name, description: item.client_sentence, destination: 'Gulmarg', kind: 'sightseeing',
      reason: 'Legacy planning status', tags: [], intelligence: { status: statuses[index % statuses.length] },
    })) });
    // Exercise old saved blocks directly: rendering must honor current ticks
    // even before the provider has regenerated their scheduling metadata.
    assertSelectedCopy([legacy], places, [unchecked]);
    select('Gulmarg', [...places, unchecked], []);
    assertSelectedCopy([legacy], [], [...places, unchecked]);
  });

  test('known custom blocks follow library checkboxes while genuinely custom places remain editable', () => {
    const chosen = sight('Checked custom library place');
    const unchecked = sight('Unticked custom library place');
    select('Srinagar', [chosen, unchecked], [chosen.name]);
    const privatePlace = 'Private family garden visit';
    const legacy = day('Srinagar', { blocks: [...[chosen, unchecked].map((item) => ({
      name: item.name, description: item.client_sentence, destination: 'Srinagar', kind: 'custom', reason: '', tags: [],
    })), { name: privatePlace, description: 'A personal request.', destination: 'Srinagar', kind: 'custom', reason: '', tags: [] }] });
    assertSelectedCopy([legacy], [chosen], [unchecked]);
    assert.ok(copy([legacy]).includes(privatePlace), 'An operator-authored custom place outside the library must remain supported.');
  });

  test('editing a library planned sentence invalidates manual About inside an ordinary day-trip wrapper', () => {
    const chosen = sight('Sonamarg checked river stop');
    select('Sonamarg', [chosen]);
    const result = schedule([day('Srinagar', { dayTripDestination: 'Sonamarg' })]);
    result[0].customAbout = 'The manually approved river visit.';
    result[0].customAboutContext = dayScheduleContext(result[0]);
    const unchanged = schedule(result);
    assert.equal(unchanged[0].customAbout, result[0].customAbout);
    const edited = { ...chosen, client_sentence: 'Explore the Sonamarg riverbank beside its pine-lined mountain slopes.' };
    select('Sonamarg', [edited]);
    const changed = schedule(unchanged);
    assert.equal(changed[0].customAbout, undefined, 'A generic day-trip wrapper must not hide a changed planned sightseeing sentence.');
    assert.equal(changed[0].previousCustomAbout, result[0].customAbout);
    assertSelectedCopy(changed, [edited], [chosen]);
  });

  test('an unchanged legacy manual programme upgrades its saved context before future library edits', () => {
    const chosen = sight('Sonamarg legacy river stop');
    select('Sonamarg', [chosen]);
    const result = schedule([day('Srinagar', { dayTripDestination: 'Sonamarg' })]);
    const legacy = JSON.parse(JSON.stringify(result));
    for (const block of legacy[0].blocks) delete block.librarySights;
    legacy[0].customAbout = 'A previously saved and manually approved river visit.';
    legacy[0].customAboutContext = dayScheduleContext(legacy[0], false);
    const oldContext = legacy[0].customAboutContext;
    const upgraded = schedule(legacy);
    assert.equal(upgraded[0].customAbout, legacy[0].customAbout, 'Context migration must preserve an unchanged manual draft.');
    assert.equal(upgraded[0].customAboutContext, dayScheduleContext(upgraded[0]), 'The refreshed draft must track current library source lines.');
    assert.notEqual(upgraded[0].customAboutContext, oldContext, 'The legacy context must be upgraded, not left with its old blind spot.');
    const edited = { ...chosen, client_sentence: 'Walk beside the Sonamarg river on the revised arranged route.' };
    select('Sonamarg', [edited]);
    const changed = schedule(upgraded);
    assert.equal(changed[0].customAbout, undefined, 'A later source-line edit must invalidate the upgraded manual text.');
    assertSelectedCopy(changed, [edited], [chosen]);
  });

  test('legacy manual context migration cannot retain an unchecked merged source sentence', () => {
    const city = sight('Pari Mahal', { client_sentence: 'Walk through Pari Mahal’s historic terraces with the city guide.' });
    const excursion = sight('Pari Mahal', { client_sentence: 'Pause at Pari Mahal for its elevated lake panorama.' });
    const overrides = {
      Srinagar: { local_sightseeing: [city], enabled_sightseeing: [city.name] },
      'Mughal Gardens Cluster': { local_sightseeing: [excursion], enabled_sightseeing: [excursion.name] },
    };
    catalog(overrides);
    const result = schedule([day('Srinagar'), day('Srinagar', { day: 3, date: '2026-12-20', dayTripDestination: 'Mughal Gardens Cluster' })]);
    const legacy = JSON.parse(JSON.stringify(result));
    for (const item of legacy) for (const block of item.blocks) delete block.librarySights;
    legacy[1].customAbout = `A tailored garden excursion. ${city.client_sentence} ${excursion.client_sentence}`;
    legacy[1].customAboutContext = dayScheduleContext(legacy[1], false);
    catalog({ ...overrides, Srinagar: { ...overrides.Srinagar, enabled_sightseeing: [] } });
    const changed = schedule(legacy);
    assert.equal(changed[1].customAbout, undefined,
      'An unchanged physical wrapper name must not migrate manual copy containing a deselected source sentence.');
    assert.equal(changed[1].previousCustomAbout, legacy[1].customAbout, 'Retain the old manual copy only as a review reference.');
    assertSelectedCopy(changed, [excursion], [city]);
  });
} finally { replaceDestinationCatalog(original); }

if (failures.length) {
  console.error(`${failures.length} checkbox-authority regression(s) failed; ${checks} passed.`);
  process.exitCode = 1;
} else console.log(`Sightseeing checkbox authority passed: ${checks} regressions.`);
