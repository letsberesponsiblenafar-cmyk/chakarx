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
const { createPlan, rebuildPlanFromNightSequence, setPlanDayTrip, retargetDay, reschedulePlan } = require('../lib/itinerary.ts');
const { dayNarrative } = require('../lib/narrative.ts');
const original = [...destinations];
const activityKey = (destination, activity) => `${destination}\u001f${activity}`;
const failures = [];
let checks = 0;
function test(name, run) {
  try { run(); checks++; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push({ name, error }); process.stderr.write(`FAIL ${name}: ${error.message}\n`); }
}

function sight(name, options = {}) {
  return { name, description: '', client_sentence: `Visit ${name}.`, tags: ['Nature'], season: 'all', visit_minutes: 45,
    transfer_minutes: 10, arrival_suitable: true, cluster: 'nearby', ...options };
}
const fixtureNames = ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg'];
function fixtures() {
  return original.map((destination) => {
    if (!fixtureNames.includes(destination.name)) return destination;
    const hours = { Srinagar: 0, Gulmarg: 2.5, Pahalgam: 3, Sonamarg: 3 }[destination.name];
    const local_sightseeing = destination.name === 'Pahalgam' ? [
      sight('Pahalgam riverside', { visit_minutes: 45, transfer_minutes: 10 }),
      sight('Pahalgam town walk', { visit_minutes: 40, transfer_minutes: 5 }),
      sight('Aru Valley excursion', { visit_minutes: 120, transfer_minutes: 60, arrival_suitable: false, cluster: 'aru' }),
      sight('Betaab Valley excursion', { visit_minutes: 90, transfer_minutes: 45, arrival_suitable: false, cluster: 'betaab' }),
      sight('Chandanwari excursion', { visit_minutes: 90, transfer_minutes: 45, arrival_suitable: false, cluster: 'chandanwari' }),
    ] : Array.from({ length: 12 }, (_, index) => sight(`${destination.name} planned stop ${index + 1}`, { cluster: `area-${Math.floor(index / 4)}` }));
    return { ...destination, base: true, overnight_allowed: true, season: 'all', access: 'standard', srinagar_hours: hours,
      srinagar_km: { Srinagar: 0, Gulmarg: 52, Pahalgam: 90, Sonamarg: 87 }[destination.name],
      hub_route: { km: 0, hours, hours_max: hours, reference_point: 'Srinagar city', road_endpoint: destination.name, access_mode: 'road',
        source_urls: [], reviewed_at: '2026-10-11', basis: 'planning-estimate', note: 'Deterministic scheduling test fixture.' },
      day_note: `Discover the scenery of ${destination.name}.`, local_sightseeing,
      enabled_sightseeing: local_sightseeing.map((item) => item.name), things_to_do: local_sightseeing.map((item) => item.name),
      activities: [], activity_copy: {}, activity_timing: {}, enabled_activities: [] };
  });
}
const dateAfter = (offset) => new Date(Date.UTC(2026, 9, 11 + offset)).toISOString().slice(0, 10);
function planFor(sequence, overrides = {}) {
  const input = { name: 'Timed journey QA', arrival: dateAfter(0), departure: dateAfter(sequence.length), arrivalTime: '09:00',
    departureTime: '18:30', pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature',
    transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'], ...overrides };
  let plan = rebuildPlanFromNightSequence(createPlan(input), sequence);
  for (let day = 1; day <= sequence.length; day++) plan = setPlanDayTrip(plan, day, null);
  return plan;
}
function allocated(day) {
  return day.blocks.filter((block) => block.kind === 'sightseeing').flatMap((block) => (block.sights || [block.name]).map((name) => `${block.destination}\u001f${name}`));
}
function reset() { replaceDestinationCatalog(fixtures()); }
function setActivities(names, timing, enabled = names) {
  const destination = destinationByName('Srinagar');
  replaceDestinationCatalog(destinations.map((item) => item.name === 'Srinagar' ? { ...destination, activities: names,
    activity_timing: Object.fromEntries(names.map((name) => [name, { duration_minutes: timing[name] }])),
    activity_copy: Object.fromEntries(names.map((name) => [name, `Enjoy the ${name.toLowerCase()}.`])), enabled_activities: enabled } : item));
}
function quote(names) {
  return { activityCosts: Object.fromEntries(names.map((name) => [activityKey('Srinagar', name), 1000])),
    activitySelections: Object.fromEntries(names.map((name) => [activityKey('Srinagar', name), true])) };
}

try {
  test('time budgets remain conserved across arrival, transfer, sightseeing and departure days', () => {
    reset();
    for (const style of ['Relaxed', 'Balanced', 'Packed']) for (const arrivalTime of ['06:00', '13:00', '20:00']) {
      const plan = planFor(['Srinagar', 'Gulmarg', 'Pahalgam', 'Pahalgam', 'Srinagar'], { style, arrivalTime });
      for (const day of plan.dayPlans) {
        const timing = day.timing;
        assert.ok(timing, `Day ${day.day} lacks timing.`);
        assert.ok(timing.scheduledMinutes >= 0 && timing.remainingMinutes >= 0);
        assert.ok(timing.driveMinutes + timing.serviceMinutes + timing.scheduledMinutes <= timing.availableMinutes,
          `${style}, arrival ${arrivalTime}, day ${day.day} exceeds its usable window.`);
        assert.equal(timing.remainingMinutes, timing.availableMinutes - timing.driveMinutes - timing.serviceMinutes - timing.scheduledMinutes);
      }
    }
  });

  test('repeated overnight bases receive different places rather than duplicate sightseeing', () => {
    reset();
    const plan = planFor(['Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar', 'Srinagar']);
    const stops = plan.dayPlans.flatMap(allocated);
    assert.equal(new Set(stops).size, stops.length, 'A named sightseeing place was repeated.');
    const srinagarDays = plan.dayPlans.filter((day) => allocated(day).some((name) => name.startsWith('Srinagar\u001f')));
    assert.ok(srinagarDays.length >= 3, 'Srinagar places should be shared across separate return visits.');
    assert.ok(plan.dayPlans[2].blocks.some((block) => /Valley excursion/.test(block.name)), 'The full Pahalgam day should contain the major excursions.');
  });

  test('a long Gulmarg to Pahalgam transfer reserves nearby stops and leaves major valleys for the full day', () => {
    reset();
    const plan = planFor(['Gulmarg', 'Pahalgam', 'Pahalgam', 'Srinagar']);
    const arrival = plan.dayPlans[1];
    assert.ok(arrival.drive.hours >= 5, 'Fixture should require a long cross-valley transfer.');
    assert.ok(arrival.blocks.some((block) => /riverside|town walk/.test(block.name)), 'The arrival day needs a concrete nearby programme.');
    assert.ok(arrival.blocks.every((block) => !/Valley excursion|Chandanwari excursion/.test(block.name)));
    assert.doesNotMatch(dayNarrative(arrival, 'Srinagar'), /Aru Valley excursion|Betaab Valley excursion|own pace|rest of the day/i);
    assert.match(dayNarrative(plan.dayPlans[2], 'Srinagar'), /Aru Valley excursion|Betaab Valley excursion/);
  });

  test('Sonamarg overnight permits an early checkout for a 13:00 Srinagar departure without extra sightseeing', () => {
    reset();
    const departure = planFor(['Srinagar', 'Sonamarg'], { departureTime: '13:00' }).dayPlans.at(-1);
    assert.equal(departure.from, 'Sonamarg');
    assert.equal(departure.to, 'Srinagar');
    assert.ok(departure.timing.startMinutes < 8 * 60 + 30, 'The transfer should start before the sightseeing day.');
    assert.equal(departure.timing.issues.length, 0, departure.timing.issues.join(' '));
    assert.equal(allocated(departure).length, 0, 'An early transfer must not also promise sightseeing.');
  });

  test('late departure includes its newly allocated sightseeing in the client narrative', () => {
    reset();
    const departure = planFor(['Srinagar'], { arrivalTime: '20:00', departureTime: '20:00' }).dayPlans.at(-1);
    const sights = departure.blocks.filter((block) => block.kind === 'sightseeing');
    assert.ok(sights.length > 0, 'A late departure should leave room for new sights.');
    const copy = dayNarrative(departure, 'Srinagar');
    for (const stop of sights) assert.ok(copy.includes(stop.name), `Departure copy omitted ${stop.name}.`);
    assert.match(copy, /departure point|onward journey/);
  });

  test('an available priced activity is scheduled once, while unticked and unavailable activities never leak into copy', () => {
    reset();
    setActivities(['Private lake cruise', 'Closed cable ride'], { 'Private lake cruise': 90, 'Closed cable ride': 90 }, ['Private lake cruise']);
    const plan = planFor(['Srinagar', 'Srinagar', 'Srinagar']);
    const priced = quote(['Private lake cruise', 'Closed cable ride']);
    const scheduled = reschedulePlan(plan, priced);
    assert.equal(scheduled.dayPlans.flatMap((day) => day.scheduledActivities).filter((activity) => activity.name === 'Private lake cruise').length, 1);
    assert.equal(scheduled.dayPlans.filter((day) => /private lake cruise/i.test(dayNarrative(day, 'Srinagar', priced))).length, 1);
    assert.ok(scheduled.dayPlans.every((day) => !/closed cable ride/i.test(dayNarrative(day, 'Srinagar', priced))));
    const unticked = { ...priced, activitySelections: { ...priced.activitySelections, [activityKey('Srinagar', 'Private lake cruise')]: false } };
    const without = reschedulePlan(scheduled, unticked);
    assert.ok(without.dayPlans.every((day) => day.scheduledActivities.length === 0));
    assert.ok(without.dayPlans.every((day) => !/private lake cruise|closed cable ride/i.test(dayNarrative(day, 'Srinagar', unticked))));
  });

  test('an overlong included activity produces an issue while another fitting activity still gets scheduled', () => {
    reset();
    setActivities(['All day expedition', 'Short garden visit'], { 'All day expedition': 1000, 'Short garden visit': 60 });
    const priced = quote(['All day expedition', 'Short garden visit']);
    const plan = reschedulePlan(planFor(['Srinagar']), priced);
    assert.ok(plan.dayPlans.some((day) => day.timing.issues.some((issue) => /All day expedition.*cannot fit/.test(issue))));
    assert.equal(plan.dayPlans.flatMap((day) => day.scheduledActivities).filter((activity) => activity.name === 'Short garden visit').length, 1);
    assert.ok(plan.dayPlans.every((day) => !/all day expedition/i.test(dayNarrative(day, 'Srinagar', priced))));
  });

  test('unchanged manual day text survives scheduling; a changed programme regenerates copy and keeps the previous text', () => {
    reset();
    const plan = planFor(['Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar']);
    const dayNumber = 3;
    plan.dayPlans[dayNumber - 1].customAbout = 'Personal client request: a quiet valley morning.';
    const unchanged = reschedulePlan(plan);
    assert.equal(unchanged.dayPlans[dayNumber - 1].customAbout, 'Personal client request: a quiet valley morning.');
    const changed = retargetDay(unchanged, dayNumber, 'Gulmarg');
    assert.equal(changed.dayPlans[dayNumber - 1].customAbout, undefined);
    assert.equal(changed.dayPlans[dayNumber - 1].previousCustomAbout, 'Personal client request: a quiet valley morning.');
    assert.doesNotMatch(dayNarrative(changed.dayPlans[dayNumber - 1], 'Srinagar'), /Personal client request/);
    const savedAndLoaded = JSON.parse(JSON.stringify(reschedulePlan(changed)));
    assert.equal(savedAndLoaded.dayPlans[dayNumber - 1].previousCustomAbout, 'Personal client request: a quiet valley morning.');
  });

  test('a shared attraction in the actual Srinagar and Mughal Gardens records is visited only once', () => {
    replaceDestinationCatalog(original);
    const srinagar = destinationByName('Srinagar');
    const cluster = destinationByName('Mughal Gardens Cluster');
    assert.ok(cluster, 'The actual destination catalog must retain its Mughal Gardens record.');
    const shared = new Set(srinagar.local_sightseeing.map((item) => item.name).filter((name) => cluster.local_sightseeing.some((item) => item.name === name)));
    assert.ok(shared.size > 0, 'This regression requires real overlapping garden records.');
    const plan = setPlanDayTrip(planFor(['Srinagar', 'Srinagar', 'Srinagar', 'Srinagar'], { arrivalTime: '06:00', departureTime: '20:00' }), 2, cluster.name);
    const stops = plan.dayPlans.flatMap(allocated).map((stop) => stop.split('\u001f')[1]);
    const sharedVisits = stops.filter((name) => shared.has(name));
    assert.ok(sharedVisits.length > 0, 'The route must actually schedule a shared garden.');
    assert.equal(new Set(sharedVisits).size, sharedVisits.length, 'A physical garden was repeated under a different destination record.');
    assert.ok(plan.dayPlans[1].blocks.some((block) => block.destination === cluster.name && block.sights?.length), 'The selected garden excursion must receive actual sights.');
  });

  test('spring-autumn places remain eligible during summer without an explicit availability override', () => {
    reset();
    const summerGarden = sight('Summer garden visit', { season: 'spring-autumn' });
    replaceDestinationCatalog(destinations.map((item) => item.name === 'Srinagar' ? { ...item, local_sightseeing: [summerGarden],
      enabled_sightseeing: undefined, season: 'spring-autumn' } : item));
    const plan = planFor(['Srinagar', 'Srinagar'], { arrival: '2026-07-11', departure: '2026-07-13' });
    assert.ok(plan.dayPlans.flatMap(allocated).some((stop) => stop.endsWith('\u001fSummer garden visit')),
      'A March-through-November season must include July.');
  });

  test('a morning-only market waits for a dedicated local morning and conserves the expanded dawn budget', () => {
    reset();
    const morningMarket = sight('Morning-only market', { visit_minutes: 60, transfer_minutes: 15, arrival_suitable: false,
      time_window: { start: 360, end: 480 } });
    replaceDestinationCatalog(destinations.map((item) => item.name === 'Srinagar' ? { ...item, local_sightseeing: [morningMarket],
      enabled_sightseeing: [morningMarket.name] } : item));
    const plan = planFor(['Srinagar', 'Srinagar'], { arrivalTime: '20:00', departureTime: '08:00' });
    assert.equal(allocated(plan.dayPlans[0]).length, 0, 'An evening arrival cannot visit a dawn market.');
    assert.ok(allocated(plan.dayPlans[1]).some((stop) => stop.endsWith('\u001fMorning-only market')),
      'The following local day should begin with the market.');
    assert.equal(allocated(plan.dayPlans[2]).length, 0, 'An early departure cannot also promise the morning market.');
    const timing = plan.dayPlans[1].timing;
    assert.ok(timing.startMinutes >= 360 && timing.startMinutes < 480, 'The local programme must start inside the dawn opening window.');
    assert.ok(timing.availableMinutes > (18 * 60 + 30) - (8 * 60 + 30), 'The dedicated dawn visit extends the normal local-day window.');
    assert.equal(timing.remainingMinutes, timing.availableMinutes - timing.driveMinutes - timing.serviceMinutes - timing.scheduledMinutes,
      'Extending the morning must preserve the timing budget.');
    assert.ok(timing.remainingMinutes >= 0);
  });

  test('a priced hotel-base activity can use spare time after an excursion without moving the hotel', () => {
    reset();
    setActivities(['Private lake cruise'], { 'Private lake cruise': 60 });
    const plan = setPlanDayTrip(planFor(['Srinagar', 'Srinagar'], { arrivalTime: '20:00', departureTime: '08:00' }), 2, 'Gulmarg');
    const priced = quote(['Private lake cruise']);
    const scheduled = reschedulePlan(plan, priced);
    const day = scheduled.dayPlans[1];
    assert.equal(day.dayTripDestination, 'Gulmarg');
    assert.equal(day.stay, 'Srinagar');
    assert.ok(day.scheduledActivities.some((activity) => activity.destination === 'Srinagar' && activity.name === 'Private lake cruise'),
      'The Srinagar experience should fit after the Gulmarg return when time remains.');
    assert.match(dayNarrative(day, 'Srinagar', priced), /private lake cruise/i);
    assert.ok(day.timing.remainingMinutes >= 0);
  });

  test('disabling overnight stays in a core destination keeps its visit priority while using another hotel base', () => {
    reset();
    replaceDestinationCatalog(destinations.map((item) => item.name === 'Gulmarg' ? { ...item, overnight_allowed: false } : item));
    const input = { name: 'Hotel eligibility QA', arrival: dateAfter(0), departure: dateAfter(7), arrivalTime: '09:00', departureTime: '18:30',
      pickup: 'Srinagar', adults: 2, youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner',
      style: 'Balanced', interests: ['Nature'] };
    const plan = createPlan(input);
    assert.ok(plan.dayPlans.every((day) => day.stay !== 'Gulmarg'), 'A disabled overnight base cannot be selected by automatic core rules.');
    assert.ok(plan.dayPlans.some((day) => day.dayTripDestination === 'Gulmarg'), 'Gulmarg should remain a priority day visit.');
    assert.ok(plan.hotelPlans.every((hotel) => hotel.location !== 'Gulmarg'));
  });
} finally { replaceDestinationCatalog(original); }

if (failures.length) {
  for (const { name, error } of failures) process.stderr.write(`\n${name}\n${error.stack}\n`);
  process.exitCode = 1;
} else process.stdout.write(`Verified ${checks} day scheduling scenarios.\n`);
