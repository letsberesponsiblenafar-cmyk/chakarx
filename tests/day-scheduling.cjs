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
  test('time accounting remains explicit across arrival, transfer, sightseeing and departure days', () => {
    reset();
    for (const style of ['Relaxed', 'Balanced', 'Packed']) for (const arrivalTime of ['06:00', '13:00', '20:00']) {
      const plan = planFor(['Srinagar', 'Gulmarg', 'Pahalgam', 'Pahalgam', 'Srinagar'], { style, arrivalTime });
      for (const day of plan.dayPlans) {
        const timing = day.timing;
        assert.ok(timing, `Day ${day.day} lacks timing.`);
        assert.ok(timing.scheduledMinutes >= 0 && timing.remainingMinutes >= 0);
        const plannedMinutes = timing.driveMinutes + timing.serviceMinutes + timing.scheduledMinutes;
        assert.equal(timing.remainingMinutes, Math.max(0, timing.availableMinutes - plannedMinutes),
          `${style}, arrival ${arrivalTime}, day ${day.day} hides its actual timing load.`);
        if (plannedMinutes > timing.availableMinutes) assert.ok(timing.issues.length || timing.advisories?.length,
          `${style}, arrival ${arrivalTime}, day ${day.day} needs a review when selected visits exceed its window.`);
        if (timing.overrunMinutes !== undefined) assert.equal(timing.overrunMinutes, Math.max(0, plannedMinutes - timing.availableMinutes));
      }
    }
  });

  test('ordinary sightseeing days use the same 08:00–22:00 window for every travel style', () => {
    reset();
    for (const style of ['Relaxed', 'Balanced', 'Packed']) {
      const day = planFor(['Srinagar', 'Srinagar'], { style, arrivalTime: '20:00', departureTime: '08:00' }).dayPlans[1];
      assert.equal(day.timing.startMinutes, 8 * 60, `${style} starts its ordinary day at a different time.`);
      assert.equal(day.timing.endMinutes, 22 * 60, `${style} ends its ordinary day at a different time.`);
      assert.equal(day.timing.availableMinutes, 14 * 60);
    }
  });

  test('every enabled destination sight remains in the programme even when its duration needs review', () => {
    reset();
    const chosen = Array.from({ length: 12 }, (_, index) => sight(`Gulmarg selected excursion ${index + 1}`, {
      visit_minutes: 180, transfer_minutes: 30, arrival_suitable: false,
    }));
    const disabled = sight('Disabled Gulmarg excursion');
    replaceDestinationCatalog(destinations.map((item) => item.name === 'Gulmarg' ? { ...item,
      local_sightseeing: [...chosen, disabled], enabled_sightseeing: chosen.map((item) => item.name),
    } : item));
    const plan = setPlanDayTrip(planFor(['Srinagar', 'Srinagar'], { arrivalTime: '20:00', departureTime: '08:00' }), 2, 'Gulmarg');
    const stops = plan.dayPlans.flatMap(allocated);
    for (const item of chosen) assert.equal(stops.filter((stop) => stop === activityKey('Gulmarg', item.name)).length, 1,
      `${item.name} was silently dropped or repeated.`);
    assert.ok(!stops.includes(activityKey('Gulmarg', disabled.name)), 'An unticked library sight leaked into the programme.');
    assert.ok(plan.dayPlans[1].timing.issues.length || plan.dayPlans[1].timing.advisories?.length,
      'An overfull selected programme must expose its timing review.');
    const copy = dayNarrative(plan.dayPlans[1], 'Srinagar');
    for (const item of chosen) assert.ok(copy.includes(item.name), `${item.name} disappeared from client copy.`);
  });

  test('a selected sightseeing line is retained independently of a separately unquoted paid activity', () => {
    reset();
    const selected = sight('Ticket-linked selected viewpoint', { requires_activity: 'Private cable experience' });
    replaceDestinationCatalog(destinations.map((item) => item.name === 'Gulmarg' ? { ...item,
      local_sightseeing: [selected], enabled_sightseeing: [selected.name], activities: ['Private cable experience'],
      enabled_activities: ['Private cable experience'], activity_timing: { 'Private cable experience': { duration_minutes: 90 } },
      activity_copy: { 'Private cable experience': 'Enjoy the privately arranged cable experience.' },
    } : item));
    const plan = setPlanDayTrip(planFor(['Srinagar', 'Srinagar'], { arrivalTime: '20:00', departureTime: '08:00' }), 2, 'Gulmarg');
    const emptyQuote = { activityCosts: {}, activitySelections: {} };
    const scheduled = reschedulePlan(plan, emptyQuote);
    assert.ok(allocated(scheduled.dayPlans[1]).includes(activityKey('Gulmarg', selected.name)),
      'A paid-activity dependency cannot erase an explicitly selected sightseeing line.');
    assert.ok(scheduled.dayPlans.every((day) => !day.scheduledActivities.length), 'An unquoted paid activity was silently included.');
    const copy = dayNarrative(scheduled.dayPlans[1], 'Srinagar', emptyQuote);
    assert.ok(copy.includes(selected.name), 'The selected sightseeing line was erased while composing client copy.');
    assert.doesNotMatch(copy, /privately arranged cable experience/i);
  });

  test('a Srinagar hotel base on an excursion day does not become a Srinagar sightseeing day', () => {
    reset();
    let plan = planFor(['Srinagar', 'Srinagar', 'Srinagar', 'Srinagar'], { arrivalTime: '20:00', departureTime: '08:00' });
    plan = setPlanDayTrip(plan, 2, 'Gulmarg');
    plan = setPlanDayTrip(plan, 4, 'Pahalgam');
    const srinagarSights = destinationByName('Srinagar').local_sightseeing;
    for (const index of [1, 3]) assert.ok(allocated(plan.dayPlans[index]).every((stop) => !stop.startsWith('Srinagar\u001f')),
      `Day ${index + 1} became Srinagar sightseeing only because its hotel is there.`);
    const localDay = allocated(plan.dayPlans[2]);
    for (const item of srinagarSights) assert.ok(localDay.includes(activityKey('Srinagar', item.name)),
      `${item.name} was deferred to a day that only uses Srinagar for its hotel.`);
    const allStops = plan.dayPlans.flatMap(allocated);
    assert.equal(new Set(allStops).size, allStops.length);
  });

  test('a legacy route without a dedicated Srinagar day groups its city sights on one suitable hotel return', () => {
    reset();
    const plan = setPlanDayTrip(planFor(['Srinagar', 'Gulmarg', 'Pahalgam', 'Srinagar'], {
      arrivalTime: '06:00', departureTime: undefined,
    }), 1, 'Sonamarg');
    const cityDays = plan.dayPlans.filter((day) => allocated(day).some((name) => name.startsWith('Srinagar\u001f')));
    assert.equal(cityDays.length, 1, 'A fallback must group Srinagar sights together instead of spreading them across every hotel night.');
    assert.equal(cityDays[0].day, 4, 'The unhurried Pahalgam-to-Srinagar hotel return is the suitable fallback city visit.');
    assert.equal(cityDays[0].from, 'Pahalgam');
    assert.equal(cityDays[0].stay, 'Srinagar');
    for (const day of plan.dayPlans.filter((day) => day.dayTripDestination === 'Sonamarg' || day.stay === 'Gulmarg')) {
      assert.ok(allocated(day).every((name) => !name.startsWith('Srinagar\u001f')),
        'An excursion or Gulmarg visit must not inherit city sightseeing merely through its Srinagar connection.');
    }
    const allStops = plan.dayPlans.flatMap(allocated);
    for (const destination of destinations.filter((item) => fixtureNames.includes(item.name))) for (const place of destination.local_sightseeing) {
      assert.equal(allStops.filter((name) => name === activityKey(destination.name, place.name)).length, 1,
        `${destination.name}: ${place.name} was dropped or repeated while finding the fallback city day.`);
    }
    const cityIssues = plan.dayPlans.flatMap((day) => day.timing.issues).filter((message) => message.startsWith('Srinagar:'));
    assert.ok(cityIssues.every((message) => !/selected programme.*visit day/i.test(message)),
      'The grouped city return must resolve the missing Srinagar visit-day warning.');
  });

  test('an all-excursion Srinagar-base journey explicitly adds one city circuit and retains its client sentences', () => {
    reset();
    let plan = planFor(['Srinagar', 'Srinagar', 'Srinagar'], { arrivalTime: '06:00', departureTime: undefined });
    plan = setPlanDayTrip(plan, 1, 'Gulmarg');
    plan = setPlanDayTrip(plan, 2, 'Pahalgam');
    plan = setPlanDayTrip(plan, 3, 'Sonamarg');
    const markedDays = plan.dayPlans.filter((day) => day.additionalVisitDestinations?.includes('Srinagar'));
    assert.equal(markedDays.length, 1, 'Exactly one excursion day must explicitly add the missing Srinagar city circuit.');
    const cityDay = markedDays[0];
    assert.ok(cityDay.dayTripDestination, 'This regression requires a deliberate city circuit alongside an excursion.');
    assert.equal(cityDay.stay, 'Srinagar');
    assert.equal(plan.dayPlans.filter((day) => allocated(day).some((name) => name.startsWith('Srinagar\u001f'))).length, 1,
      'Srinagar sights must not spread to every day that shares its hotel base.');
    const allStops = plan.dayPlans.flatMap(allocated);
    const copy = dayNarrative(cityDay, 'Srinagar', { activityCosts: {}, activitySelections: {} });
    for (const place of destinationByName('Srinagar').local_sightseeing) {
      assert.equal(allStops.filter((name) => name === activityKey('Srinagar', place.name)).length, 1,
        `${place.name} was dropped or repeated in the explicit city circuit.`);
      assert.ok(copy.includes(place.client_sentence), `${place.name} was allocated but lost from the excursion-day client description.`);
    }
    for (const day of plan.dayPlans.filter((day) => day.dayTripDestination && day.day !== cityDay.day)) {
      assert.ok(allocated(day).every((name) => !name.startsWith('Srinagar\u001f')), 'An unmarked excursion inherited city sightseeing.');
      const otherCopy = dayNarrative(day, 'Srinagar', { activityCosts: {}, activitySelections: {} });
      for (const place of destinationByName('Srinagar').local_sightseeing) assert.ok(!otherCopy.includes(place.client_sentence),
        `${place.name} was repeated in an unmarked excursion description.`);
    }
    for (const destination of destinations.filter((item) => ['Gulmarg', 'Pahalgam', 'Sonamarg'].includes(item.name))) {
      for (const place of destination.local_sightseeing) assert.equal(allStops.filter((name) => name === activityKey(destination.name, place.name)).length, 1,
        `${destination.name}: ${place.name} was lost while adding the city circuit.`);
    }
  });

  test('repeated overnight bases receive different places rather than duplicate sightseeing', () => {
    reset();
    const plan = planFor(['Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar', 'Srinagar']);
    const stops = plan.dayPlans.flatMap(allocated);
    assert.equal(new Set(stops).size, stops.length, 'A named sightseeing place was repeated.');
    const srinagarDays = plan.dayPlans.filter((day) => allocated(day).some((name) => name.startsWith('Srinagar\u001f')));
    assert.ok(srinagarDays.length >= 2, 'Srinagar places should be shared across its dedicated sightseeing days.');
    assert.ok(allocated(plan.dayPlans[3]).every((name) => !name.startsWith('Srinagar\u001f')),
      'Returning to a Srinagar hotel must not convert the Pahalgam departure programme into Srinagar sightseeing.');
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

  test('Gulmarg to Srinagar finishes unused Gulmarg places without turning the hotel return into Srinagar sightseeing', () => {
    reset();
    const plan = planFor(['Gulmarg', 'Srinagar', 'Srinagar'], { arrivalTime: '09:00', departureTime: '08:00' });
    const arrivalStops = allocated(plan.dayPlans[0]);
    const returnStops = allocated(plan.dayPlans[1]);
    assert.ok(returnStops.some((name) => name.startsWith('Gulmarg\u001f')), 'The return day should finish an unused Gulmarg place.');
    assert.ok(returnStops.every((name) => !name.startsWith('Srinagar\u001f')), 'The overnight base alone cannot assign Srinagar sightseeing.');
    assert.ok(returnStops.every((name) => !arrivalStops.includes(name)), 'The return day repeated a Gulmarg place already visited on arrival.');
    assert.ok(allocated(plan.dayPlans[2]).some((name) => name.startsWith('Srinagar\u001f')), 'Dedicated Srinagar sightseeing belongs to the following local day.');
    for (const place of destinationByName('Gulmarg').local_sightseeing) assert.equal(plan.dayPlans.flatMap(allocated)
      .filter((name) => name === activityKey('Gulmarg', place.name)).length, 1, `${place.name} was not completed exactly once.`);
  });

  test('all selected Pahalgam places are split across the arrival and full day without losing a long visit', () => {
    reset();
    const nearby = [sight('Pahalgam nearby river'), sight('Pahalgam nearby market')];
    const major = Array.from({ length: 8 }, (_, index) => sight(`Pahalgam major valley ${index + 1}`, {
      visit_minutes: 150, transfer_minutes: 30, arrival_suitable: false, cluster: `valley-${index}`,
    }));
    const selected = [...nearby, ...major];
    replaceDestinationCatalog(destinations.map((item) => item.name === 'Pahalgam' ? { ...item,
      local_sightseeing: selected, enabled_sightseeing: selected.map((item) => item.name),
    } : item));
    const plan = planFor(['Gulmarg', 'Pahalgam', 'Pahalgam', 'Srinagar']);
    const arrival = allocated(plan.dayPlans[1]);
    const fullDay = allocated(plan.dayPlans[2]);
    assert.ok(nearby.some((item) => arrival.includes(activityKey('Pahalgam', item.name))), 'The long transfer still needs a concrete nearby programme.');
    assert.ok(major.every((item) => !arrival.includes(activityKey('Pahalgam', item.name))), 'Major valleys belong to the following full day.');
    assert.ok(major.every((item) => fullDay.includes(activityKey('Pahalgam', item.name))), 'A selected major valley disappeared because of its duration.');
    const all = plan.dayPlans.flatMap(allocated);
    for (const item of selected) assert.equal(all.filter((name) => name === activityKey('Pahalgam', item.name)).length, 1,
      `${item.name} was dropped or repeated across Pahalgam days.`);
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

  test('a 23:00 arrival and 08:00 departure retain the travel times and request a real visit day', () => {
    reset();
    const plan = planFor(['Srinagar'], { arrivalTime: '23:00', departureTime: '08:00' });
    assert.equal(plan.input.arrivalTime, '23:00');
    assert.equal(plan.input.departureTime, '08:00');
    assert.ok(plan.dayPlans.every((day) => allocated(day).length === 0), 'Selected places cannot create sightseeing time between a late arrival and early flight.');
    const reviews = plan.dayPlans.flatMap((day) => [...day.timing.issues, ...(day.timing.advisories || [])]);
    assert.ok(reviews.some((message) => /selected programme.*visit day|selected.*(?:sight|place).*day/i.test(message)),
      'When no actual visit day exists, the operator needs a selected-programme coverage review.');
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
    assert.equal(plan.dayPlans[1].dayTripDestination, cluster.name, 'Deduplicating gardens must not change the selected excursion.');
  });

  test('physical aliases do not repeat a lake visit through different destination records', () => {
    reset();
    const names = { Srinagar: ['Nigeen Lake', 'Dal Lake & Boulevard'], 'Nigeen Lake': ['Nigeen-Lake'], 'Dal Lake': ['Dal Lake waterfront'] };
    replaceDestinationCatalog(destinations.map((item) => names[item.name] ? { ...item,
      local_sightseeing: names[item.name].map((name) => sight(name)), enabled_sightseeing: names[item.name],
    } : item));
    let plan = planFor(['Srinagar', 'Srinagar', 'Srinagar'], { arrivalTime: '06:00', departureTime: '20:00' });
    plan = setPlanDayTrip(plan, 2, 'Nigeen Lake');
    plan = setPlanDayTrip(plan, 3, 'Dal Lake');
    const stops = plan.dayPlans.flatMap(allocated).map((name) => name.split('\u001f')[1]);
    assert.equal(stops.filter((name) => /Nigeen[- ]Lake/i.test(name)).length, 1, 'Punctuation changed the identity of the same lake.');
    assert.equal(stops.filter((name) => /^Dal Lake (?:& Boulevard|waterfront)$/i.test(name)).length, 1,
      'The waterfront and Boulevard aliases repeated the same Dal Lake visit.');
  });

  test('saving and reloading a complete selected programme does not change coverage or accumulate reviews', () => {
    reset();
    let plan = planFor(['Srinagar', 'Gulmarg', 'Pahalgam', 'Pahalgam', 'Srinagar'], { arrivalTime: '20:00', departureTime: '08:00' });
    plan = setPlanDayTrip(plan, 5, 'Sonamarg');
    const first = reschedulePlan(plan, { activityCosts: {}, activitySelections: {} });
    const restored = reschedulePlan(JSON.parse(JSON.stringify(first)), { activityCosts: {}, activitySelections: {} });
    assert.deepEqual(JSON.parse(JSON.stringify(restored.dayPlans)), JSON.parse(JSON.stringify(first.dayPlans)),
      'A saved programme drifted when it was reopened.');
    const names = restored.dayPlans.flatMap(allocated);
    assert.equal(new Set(names).size, names.length, 'Reloading introduced repeated visits.');
  });

  test('an eight-day journey retains every enabled core-library sightseeing line in client descriptions', () => {
    replaceDestinationCatalog(original.map((item) => fixtureNames.includes(item.name) ? { ...item,
      enabled_sightseeing: item.local_sightseeing.map((place) => place.name),
    } : item));
    const plan = planFor(['Srinagar', 'Gulmarg', 'Srinagar', 'Pahalgam', 'Pahalgam', 'Srinagar', 'Sonamarg'], {
      arrivalTime: '09:00', departureTime: '18:30',
    });
    const stops = plan.dayPlans.flatMap(allocated);
    for (const destination of destinations.filter((item) => fixtureNames.includes(item.name))) for (const place of destination.local_sightseeing) {
      assert.equal(stops.filter((name) => name === activityKey(destination.name, place.name)).length, 1,
        `${destination.name}: ${place.name} was dropped or repeated in the actual library programme.`);
      const assignedDay = plan.dayPlans.find((day) => allocated(day).includes(activityKey(destination.name, place.name)));
      const sentence = place.client_sentence || `Visit ${place.name}.`;
      assert.ok(dayNarrative(assignedDay, 'Srinagar', { activityCosts: {}, activitySelections: {} }).includes(sentence),
        `${destination.name}: ${place.name} was allocated but its planned itinerary sentence is absent from client copy.`);
    }
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

  test('a late local departure can cover a dawn market before its airport transfer', () => {
    reset();
    const market = sight('Departure-morning market', { client_sentence: 'Visit the Departure-morning market during the early-morning lake excursion.',
      visit_minutes: 60, transfer_minutes: 15, arrival_suitable: false, time_window: { start: 360, end: 480 } });
    replaceDestinationCatalog(destinations.map((item) => item.name === 'Srinagar' ? { ...item,
      local_sightseeing: [market], enabled_sightseeing: [market.name],
    } : item));
    const plan = planFor(['Srinagar'], { arrivalTime: '20:00', departureTime: '20:00' });
    assert.equal(allocated(plan.dayPlans[0]).length, 0, 'The preceding evening arrival cannot consume the morning market.');
    const departure = plan.dayPlans.at(-1);
    const stop = departure.blocks.find((block) => block.name === market.name);
    assert.ok(stop, 'The departure morning must retain the selected market when there is enough time before the flight.');
    assert.equal(stop.startMinute, 360, 'The market must be placed at the dedicated 06:00 start.');
    assert.equal(departure.timing.startMinutes, 360);
    assert.equal(plan.dayPlans.flatMap(allocated).filter((name) => name === activityKey('Srinagar', market.name)).length, 1);
    const copy = dayNarrative(departure, 'Srinagar');
    assert.ok(copy.includes(market.client_sentence));
    assert.ok(copy.indexOf(market.client_sentence) < copy.indexOf('Your driver will transfer'),
      'The client must visit the dawn market before the departure transfer.');
    assert.equal(departure.timing.issues.length, 0, departure.timing.issues.join(' '));
    const earlyFlight = planFor(['Srinagar'], { arrivalTime: '20:00', departureTime: '08:00' });
    assert.ok(earlyFlight.dayPlans.every((day) => allocated(day).length === 0), 'An 08:00 flight cannot also promise the dawn market.');
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
