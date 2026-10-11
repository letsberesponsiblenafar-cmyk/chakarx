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
const { dayNarrative } = require('../lib/narrative.ts');
const { dayScheduleContext } = require('../lib/day-scheduler.ts');
const original = [...destinations];
const sight = (name, sentence, extra = {}) => ({ name, description: '', client_sentence: sentence, tags: [], ...extra });
const siteBlock = (destination, name) => ({ destination, name, kind: 'sightseeing', description: '', reason: '', tags: [] });
const day = (extra = {}) => ({ day: 2, date: '2026-10-12', label: 'Sightseeing day', from: 'Srinagar', to: 'Srinagar',
  stay: 'Srinagar', transfer: false, drive: { km: 0, hours: 0, via: [], known: true }, blocks: [], notes: [],
  primaryVisitFor: [], scheduledActivities: [], ...extra });
const fixtures = original.map((destination) => {
  if (destination.name === 'Srinagar') return { ...destination,
    day_note: 'Discover Srinagar’s lakeside setting and cultural heritage.',
    local_sightseeing: [sight('Dal Lake & Boulevard', 'Walk beside Dal Lake and Boulevard Road.'), sight('Shalimar Bagh', 'Explore the terraces of Shalimar Bagh.')],
    enabled_sightseeing: [], activities: ['Private evening lake cruise'], enabled_activities: ['Private evening lake cruise'],
    activity_copy: { 'Private evening lake cruise': 'Enjoy a private evening cruise on Dal Lake.' }, activity_timing: {} };
  if (destination.name === 'Gulmarg') return { ...destination,
    day_note: 'Discover Gulmarg’s alpine setting and Pir Panjal scenery.',
    local_sightseeing: [sight('Gulmarg Meadow', 'Walk across Gulmarg Meadow.'), sight('Gulmarg Gondola', 'Visit the Gulmarg Gondola viewing area.', { requires_activity: 'Gondola ride' })],
    enabled_sightseeing: [], activities: ['Gondola ride'], enabled_activities: ['Gondola ride'],
    activity_copy: { 'Gondola ride': 'Enjoy the Gulmarg Gondola ride.' }, activity_timing: {} };
  if (destination.name === 'Pahalgam') return { ...destination,
    day_note: 'Explore Pahalgam’s pine-lined mountain valley.',
    local_sightseeing: [sight('Pahalgam riverside', 'Walk beside the Lidder River in Pahalgam.'), sight('Aru Valley', 'Explore Aru Valley’s alpine meadows.'), sight('Betaab Valley', 'Visit Betaab Valley’s river and mountain setting.')],
    enabled_sightseeing: [], activities: [], enabled_activities: [], activity_copy: {}, activity_timing: {} };
  return destination;
});

try {
  replaceDestinationCatalog(fixtures);
  const excursion = day({ dayTripDestination: 'Gulmarg', primaryVisitFor: ['Srinagar', 'Gulmarg'],
    blocks: [siteBlock('Gulmarg', 'Gulmarg Meadow'), siteBlock('Srinagar', 'Shalimar Bagh')] });
  const excursionCopy = dayNarrative(excursion, 'Srinagar');
  assert.match(excursionCopy, /Walk across Gulmarg Meadow/);
  assert.doesNotMatch(excursionCopy, /lakeside setting|cultural heritage|Shalimar Bagh|Srinagar local sightseeing/,
    'An excursion must not become a second sightseeing programme merely because the hotel is in Srinagar.');

  const activityKey = 'Srinagar\u001fPrivate evening lake cruise';
  const quote = { activityCosts: { [activityKey]: 3000 }, activitySelections: { [activityKey]: true } };
  const eveningActivity = { key: activityKey, destination: 'Srinagar', name: 'Private evening lake cruise', minutes: 60 };
  const withCruise = dayNarrative({ ...excursion, scheduledActivities: [eveningActivity] }, 'Srinagar', quote);
  assert.match(withCruise, /Enjoy a private evening cruise on Dal Lake/);
  assert.doesNotMatch(withCruise, /lakeside setting|cultural heritage|Shalimar Bagh/);
  assert.ok(withCruise.indexOf('Return to Srinagar') < withCruise.indexOf('private evening cruise'), 'The hotel-base experience follows the excursion return.');
  const unticked = { ...quote, activitySelections: { [activityKey]: false } };
  assert.doesNotMatch(dayNarrative({ ...excursion, scheduledActivities: [eveningActivity] }, 'Srinagar', unticked), /private evening cruise/);

  const empty = day({ primaryVisitFor: ['Srinagar'] });
  assert.doesNotMatch(dayNarrative(empty, 'Srinagar'), /lakeside setting|cultural heritage|Dal Lake|own pace|rest of the day/,
    'An empty programme must not invent a generic destination visit.');

  const assigned = day({ stay: 'Gulmarg', from: 'Gulmarg', to: 'Gulmarg', primaryVisitFor: ['Gulmarg'],
    blocks: [siteBlock('Gulmarg', 'Gulmarg Meadow'), siteBlock('Gulmarg', 'Gulmarg Gondola'), siteBlock('Gulmarg', 'Gulmarg Meadow')] });
  const assignedCopy = dayNarrative(assigned, 'Srinagar', { activityCosts: {}, activitySelections: {} });
  assert.match(assignedCopy, /Visit the Gulmarg Gondola viewing area/,
    'Assigned sightseeing must survive rendering without a second price or availability filter.');
  assert.equal((assignedCopy.match(/Walk across Gulmarg Meadow/g) || []).length, 1);
  assert.doesNotMatch(assignedCopy, /Enjoy the Gulmarg Gondola ride/, 'An unquoted paid activity must not be promised by the sightseeing copy.');
  const gondolaKey = 'Gulmarg\u001fGondola ride';
  const gondolaActivity = { key: gondolaKey, destination: 'Gulmarg', name: 'Gondola ride', minutes: 120 };
  const gondolaQuote = { activityCosts: { [gondolaKey]: 4000 }, activitySelections: { [gondolaKey]: true } };
  const detailedGondola = dayNarrative({ ...assigned, scheduledActivities: [gondolaActivity] }, 'Srinagar', gondolaQuote);
  assert.match(detailedGondola, /Visit the Gulmarg Gondola viewing area/,
    'An activity naming a place must not erase the operator’s specific sightseeing instructions.');
  assert.match(detailedGondola, /Enjoy the Gulmarg Gondola ride/, 'The quoted activity keeps its separate authored experience sentence.');
  assert.equal((detailedGondola.match(/Walk across Gulmarg Meadow/g) || []).length, 1);

  const returnDay = day({ from: 'Gulmarg', stay: 'Srinagar', transfer: true, primaryVisitFor: ['Gulmarg', 'Srinagar'],
    blocks: [siteBlock('Gulmarg', 'Gulmarg Gondola')] });
  const returnCopy = dayNarrative(returnDay, 'Srinagar');
  assert.match(returnCopy, /Visit the Gulmarg Gondola viewing area/);
  assert.doesNotMatch(returnCopy, /Walk across Gulmarg Meadow|lakeside setting|Shalimar Bagh/);
  assert.ok(returnCopy.indexOf('Gondola viewing area') < returnCopy.indexOf('Drive to Srinagar'), 'Remaining Gulmarg sightseeing precedes the transfer to the overnight base.');
  const returnCruiseCopy = dayNarrative({ ...returnDay, scheduledActivities: [eveningActivity] }, 'Srinagar', quote);
  assert.match(returnCruiseCopy, /private evening cruise/, 'A quoted hotel-base activity may follow the return transfer.');
  assert.doesNotMatch(returnCruiseCopy, /lakeside setting|cultural heritage/,
    'A return-day hotel-base activity must not add an unrelated city guide introduction.');

  const arrival = day({ from: 'Gulmarg', to: 'Pahalgam', stay: 'Pahalgam', transfer: true, primaryVisitFor: [],
    blocks: [siteBlock('Pahalgam', 'Pahalgam riverside')] });
  const fullDay = day({ day: 3, from: 'Pahalgam', to: 'Pahalgam', stay: 'Pahalgam', primaryVisitFor: ['Pahalgam'],
    blocks: [siteBlock('Pahalgam', 'Aru Valley'), siteBlock('Pahalgam', 'Betaab Valley')] });
  const arrivalCopy = dayNarrative(arrival, 'Srinagar');
  const fullCopy = dayNarrative(fullDay, 'Srinagar');
  assert.match(arrivalCopy, /Walk beside the Lidder River in Pahalgam/);
  assert.doesNotMatch(arrivalCopy, /Aru Valley|Betaab Valley|own pace|rest of the day/);
  assert.match(fullCopy, /Explore Aru Valley’s alpine meadows/);
  assert.match(fullCopy, /Visit Betaab Valley’s river and mountain setting/);
  assert.doesNotMatch(fullCopy, /Walk beside the Lidder River/);

  const manual = 'After breakfast, follow the client’s confirmed private programme.';
  assert.equal(dayNarrative({ ...fullDay, customAbout: manual }, 'Srinagar'), manual, 'Manual About This Day text remains authoritative.');

  const focusedExcursion = { ...excursion, blocks: [siteBlock('Gulmarg', 'Gulmarg Meadow')] };
  const unchangedProgramme = dayScheduleContext(focusedExcursion);
  const unchangedCopy = dayNarrative(focusedExcursion, 'Srinagar');
  replaceDestinationCatalog(fixtures.map((destination) => destination.name === 'Srinagar'
    ? { ...destination, day_note: 'Discover Srinagar’s newly edited heritage guide.' } : destination));
  assert.equal(dayNarrative(focusedExcursion, 'Srinagar'), unchangedCopy, 'Editing the overnight base guide must not alter an excursion narrative.');
  assert.equal(dayScheduleContext(focusedExcursion), unchangedProgramme,
    'Editing an unused overnight-base guide must not invalidate a manual excursion description.');

  // Cover every real destination's authored wording in each journey shape.
  // These are rendering fixtures: selected places are already assigned by the
  // scheduler, independently of whether a destination permits a hotel stay.
  replaceDestinationCatalog(original.map((destination) => ({ ...destination, enabled_activities: destination.activities })));
  for (const destination of destinations) {
    const blocks = destination.local_sightseeing.map((place) => siteBlock(destination.name, place.name));
    const local = day({ from: destination.name, to: destination.name, stay: destination.name,
      primaryVisitFor: [destination.name], blocks });
    const journeys = [local];
    if (destination.name !== 'Srinagar') journeys.push(
      { ...local, from: 'Srinagar', transfer: true },
      { ...local, from: 'Srinagar', to: 'Srinagar', stay: 'Srinagar', dayTripDestination: destination.name },
      { ...local, to: 'Srinagar', stay: 'Srinagar', transfer: true },
    );
    for (const journey of journeys) {
      const text = dayNarrative(journey, 'Srinagar');
      for (const place of destination.local_sightseeing) {
        const sentence = place.client_sentence;
        if (sentence) assert.equal(text.split(sentence).length - 1, 1,
          `${destination.name}: ${place.name} must retain its authored sentence once in ${journey.dayTripDestination ? 'an excursion' : journey.transfer ? 'a transfer' : 'a local visit'}.`);
      }
    }
    for (const name of destination.activities) {
      const key = `${destination.name}\u001f${name}`;
      const quote = { activityCosts: { [key]: 0 }, activitySelections: { [key]: true } };
      const scheduled = { key, destination: destination.name, name, minutes: 60 };
      const text = dayNarrative({ ...local, scheduledActivities: [scheduled] }, 'Srinagar', quote);
      const sentence = destination.activity_copy?.[name];
      if (sentence) assert.ok(text.includes(sentence), `${destination.name}: the scheduled ${name} sentence must remain in client copy.`);
    }
  }
} finally { replaceDestinationCatalog(original); }

console.log('Narrative coverage passed: excursion focus, return-day sights, assigned coverage, unique copy and manual edits.');
