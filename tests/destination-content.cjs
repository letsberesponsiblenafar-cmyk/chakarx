const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
const load = Module._load;
const hooks = [];
let hookIndex = 0;
let planner;
Module._resolveFilename = function (request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  if (request === 'react') return { ...React,
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useMemo: (callback) => callback(),
  };
  if (request === '@/components/PlannerProvider') return { usePlanner: () => planner };
  if (request === 'next/link' || request === '@/components/AppShell' || request === '@/components/PackageDefaultsEditor'
    || request === '@/components/DestinationDeleteSection') return { __esModule: true, default: () => null };
  return load.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};
require.extensions['.css'] = () => {};

const { destinations, enrichDestination, enabledSightseeing, replaceDestinationCatalog } = require('../lib/data.ts');
const { destinationAbout, dayNarrative, sightseeingSentence } = require('../lib/narrative.ts');
const { validateDestination } = require('../lib/destination-validation.ts');
const { scheduleDayPlans } = require('../lib/day-scheduler.ts');
const LibraryPage = require('../app/library/page.tsx').default;
const DestinationEditor = require('../components/DestinationEditor.tsx').default;
const bundled = require('../data/destinations.json');
const defaults = require('../data/destination-planning.json');
const original = [...destinations];
const srinagar = original.find((destination) => destination.name === 'Srinagar');
const emptyQuote = { activityCosts: {}, activitySelections: {} };
const input = { name: 'Content regression', arrival: '2026-10-20', departure: '2026-10-22', pickup: 'Srinagar', adults: 2,
  youngAges: [], budget: 0, hotelCategory: 'Signature', transport: 'Sedan', mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'] };
let checks = 0;
const failures = [];

function test(name, run) {
  try { replaceDestinationCatalog(original); run(); checks++; console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.stack}`); }
}
function all(element, predicate) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap((item) => all(item, predicate));
  return [...(predicate(element) ? [element] : []), ...all(element.props?.children, predicate)];
}
function text(element) {
  if (element == null || typeof element === 'boolean') return '';
  if (Array.isArray(element)) return element.map(text).join('');
  return typeof element === 'object' ? text(element.props?.children) : String(element);
}
function renderLibrary(catalog, reset = true, overrides = {}) {
  if (reset) hooks.length = 0;
  hookIndex = 0;
  planner = { destinationCatalog: catalog, destinationConnection: 'ready', destinationConnectionError: '', refreshDestinations: async () => {}, ...overrides };
  return LibraryPage();
}

try {
  test('automatic About follows checked library order, activities, punctuation and empty selections', () => {
    const record = { ...srinagar, day_note_mode: 'auto', day_note: 'Old manual text.',
      local_sightseeing: [
        { name: 'First', description: '', tags: [], client_sentence: '  explore   the garden  ' },
        { name: 'Second', description: '', tags: [], client_sentence: 'visit the lake .' },
        { name: 'Hidden', description: '', tags: [], client_sentence: 'This is unchecked.' },
      ], enabled_sightseeing: ['Second', 'First'], activities: ['Shikara ride', 'Hidden activity'],
      enabled_activities: ['Shikara ride'], activity_copy: {} };
    assert.equal(destinationAbout(record), 'Explore the garden. Visit the lake. Enjoy a shikara ride.');
    assert.equal(destinationAbout({ ...record, enabled_sightseeing: ['Second'] }), 'Visit the lake. Enjoy a shikara ride.');
    assert.equal(destinationAbout({ ...record, enabled_sightseeing: [], enabled_activities: [] }), '');
    const reloaded = validateDestination(JSON.parse(JSON.stringify({ ...record, id: 'automatic-test' })));
    assert.equal(reloaded.day_note_mode, 'auto');
    assert.equal(destinationAbout(reloaded), destinationAbout(record));
    assert.throws(() => validateDestination({ ...record, id: 'automatic-test', day_note_mode: 'invalid' }), /automatic or manual/);
  });

  test('manual library About reaches itinerary in full and manual day copy has final priority', () => {
    const about = 'A complete introduction. A second sentence.\nA third paragraph, subject to local permissions.';
    const record = { ...srinagar, day_note_mode: 'manual', day_note: about };
    replaceDestinationCatalog([record]);
    const day = { day: 2, date: '2026-10-21', label: 'Sightseeing day', from: 'Srinagar', to: 'Srinagar', stay: 'Srinagar', transfer: false,
      primaryVisitFor: ['Srinagar'], drive: { km: 0, hours: 0, via: [], known: true }, notes: [],
      blocks: [{ destination: 'Srinagar', name: enabledSightseeing(record)[0], kind: 'sightseeing' }] };
    const copy = dayNarrative(day, 'Srinagar');
    assert.ok(copy.includes(about), 'Manual paragraphs must not be filtered or capped at two sentences.');
    assert.equal(copy.split(about).length - 1, 1);
    assert.equal(dayNarrative({ ...day, customAbout: 'Client-specific wording.' }, 'Srinagar'), 'Client-specific wording.');
    assert.equal(destinationAbout({ ...record, enabled_sightseeing: [] }), about);
  });

  test('automatic itinerary uses only that day’s assigned library experiences and included activities', () => {
    const record = { ...srinagar, day_note_mode: 'auto', day_note: 'Old manual introduction.',
      local_sightseeing: [
        { name: 'First', description: '', tags: [], client_sentence: 'Explore the garden.' },
        { name: 'Second', description: '', tags: [], client_sentence: 'Visit the lake.' },
      ], enabled_sightseeing: ['First', 'Second'], activities: ['Shikara ride'], enabled_activities: ['Shikara ride'],
      activity_copy: {}, activity_timing: {} };
    replaceDestinationCatalog([record]);
    const day = { day: 2, date: '2026-10-21', label: 'Sightseeing day', from: 'Srinagar', to: 'Srinagar', stay: 'Srinagar', transfer: false,
      primaryVisitFor: ['Srinagar'], drive: { km: 0, hours: 0, via: [], known: true }, notes: [], scheduledActivities: [],
      blocks: [{ destination: 'Srinagar', name: 'First', kind: 'sightseeing' }] };
    const copy = dayNarrative(day, 'Srinagar', emptyQuote);
    assert.match(copy, /Explore the garden\./);
    assert.doesNotMatch(copy, /Visit the lake|shikara|Old manual/);
    const second = dayNarrative({ ...day, day: 3, primaryVisitFor: [], blocks: [{ destination: 'Srinagar', name: 'Second', kind: 'sightseeing' }] }, 'Srinagar', emptyQuote);
    assert.match(second, /Visit the lake\./);
    assert.doesNotMatch(second, /Explore the garden/);
  });

  test('automatic editor preview changes to manual only when typed and can return to automatic', () => {
    const record = { ...srinagar, day_note_mode: 'auto', day_note: '' };
    hooks.length = 0; hookIndex = 0;
    let tree = DestinationEditor({ initial: record, onSaved: async () => {} });
    let field = all(tree, (element) => element.props?.['aria-label'] === 'About this day')[0];
    assert.equal(field.props.value, destinationAbout(record));
    field.props.onChange({ target: { value: 'My own wording.\nKeep this paragraph.' } });
    hookIndex = 0; tree = DestinationEditor({ initial: record, onSaved: async () => {} });
    assert.equal(all(tree, (element) => element.props?.['aria-label'] === 'About this day mode')[0].props.value, 'manual');
    all(tree, (element) => element.props?.['aria-label'] === 'About this day mode')[0].props.onChange({ target: { value: 'auto' } });
    hookIndex = 0; tree = DestinationEditor({ initial: record, onSaved: async () => {} });
    assert.equal(all(tree, (element) => element.props?.['aria-label'] === 'About this day')[0].props.value, destinationAbout(record));
  });

  test('initial loading and failure never present bundled destination cards as saved data', () => {
    for (const destinationConnection of ['loading', 'error']) {
      let retries = 0;
      const tree = renderLibrary([srinagar], true, { destinationConnection, destinationConnectionError: 'Read unavailable.', refreshDestinations: async () => { retries++; } });
      assert.equal(all(tree, (element) => element.props?.className === 'dest-card rich').length, 0);
      assert.equal(all(tree, (element) => element.props?.className === 'dest-description').length, 0);
      if (destinationConnection === 'loading') assert.match(text(tree), /Loading saved destination library/);
      else {
        assert.match(text(tree), /Read unavailable/);
        all(tree, (element) => element.type === 'button' && text(element) === 'Retry connection')[0].props.onClick();
        assert.equal(retries, 1);
      }
    }
  });

  test('confirmed library has a working Refresh control and labels a failed background check', () => {
    let refreshes = 0;
    let argumentsSeen;
    const tree = renderLibrary([srinagar], true, { destinationConnectionError: 'Temporary timeout.', refreshDestinations: async (...args) => { refreshes++; argumentsSeen = args; } });
    assert.equal(all(tree, (element) => element.props?.className === 'dest-description').length, 1);
    assert.match(text(tree), /Showing the last loaded library/);
    const refresh = all(tree, (element) => element.props?.['aria-label'] === 'Refresh destination library')[0];
    assert.ok(refresh);
    refresh.props.onClick();
    assert.equal(refreshes, 1);
    assert.deepEqual(argumentsSeen, [false, { background: true }], 'Manual refresh keeps the confirmed page and any shared-default draft mounted.');
    const pendingTree = renderLibrary([srinagar], true, { destinationRefreshing: true });
    const pending = all(pendingTree, (element) => element.props?.['aria-label'] === 'Refresh destination library')[0];
    assert.equal(pending.props.disabled, true);
    assert.equal(pending.props['aria-busy'], true);
    assert.match(text(pending), /Refreshing/);
    assert.equal(all(pendingTree, (element) => element.props?.className === 'dest-description').length, 1);
  });

  test('authored About takes precedence over named defaults and an older custom description', () => {
    const about = 'A newly curated local introduction.\nA second paragraph with private-promenade detail.';
    for (const name of ['Srinagar', 'Custom valley']) {
      const record = { ...srinagar, name, day_note: about, description: 'Old summary from a previous edit.' };
      assert.equal(destinationAbout(record), about);
      assert.equal(destinationAbout(enrichDestination(record)), about);
    }
  });

  test('saving and reading About that matches legacy copy does not replace the operator text', () => {
    const legacy = bundled.find((destination) => destination.name === 'Srinagar');
    const record = { ...srinagar, id: 'Srinagar', day_note: legacy.description };
    const saved = validateDestination(record);
    assert.equal(saved.day_note, legacy.description);
    assert.equal(enrichDestination(saved).day_note, legacy.description);
    replaceDestinationCatalog([saved]);
    assert.equal(destinations[0].day_note, legacy.description);
  });

  test('genuinely missing legacy content still receives the original planning fallback', () => {
    const legacy = { ...bundled.find((destination) => destination.name === 'Srinagar') };
    delete legacy.day_note;
    assert.equal(enrichDestination(legacy).day_note, defaults.Srinagar.day_note);
    assert.equal(destinationAbout({ ...legacy, name: 'Unknown valley', description: 'An older custom introduction.' }), 'An older custom introduction.');
    assert.equal(destinationAbout({ ...legacy, name: 'Unknown valley', description: '' }), 'Explore Unknown valley.');
  });

  test('explicitly empty About remains empty through validation, repeated reads and editing', () => {
    for (const day_note of ['', '   ']) {
      const saved = validateDestination({ ...srinagar, id: 'Srinagar', day_note });
      assert.equal(saved.day_note, '');
      assert.equal(enrichDestination(enrichDestination(saved)).day_note, '');
      assert.equal(destinationAbout(saved), '');
      hooks.length = 0; hookIndex = 0;
      const editor = DestinationEditor({ initial: saved, onSaved: async () => {} });
      assert.equal(all(editor, (element) => element.type === 'textarea' && element.props.rows === 5)[0].props.value, '');
    }
    const missing = { ...srinagar, id: 'Srinagar' };
    delete missing.day_note;
    assert.equal(validateDestination(missing).day_note, defaults.Srinagar.day_note,
      'An absent old field receives its planning baseline rather than being interpreted as an authored blank.');
  });

  test('custom sightseeing descriptions survive enrichment while authored sentences and presets remain authoritative', () => {
    const custom = { name: 'River overlook', description: 'A quiet river vista.', tags: [] };
    const record = enrichDestination({ ...srinagar, local_sightseeing: [custom], enabled_sightseeing: [] });
    assert.equal(record.local_sightseeing[0].client_sentence, sightseeingSentence(custom));
    assert.equal(record.local_sightseeing[0].client_sentence, 'Visit River overlook for its quiet river vista.');
    assert.deepEqual(enabledSightseeing(record), [], 'Empty checkbox selections must not be enabled by fallback content.');
    const authored = enrichDestination({ ...srinagar, local_sightseeing: [{ ...custom, client_sentence: 'Meet the local riverside guides.' }] });
    assert.equal(authored.local_sightseeing[0].client_sentence, 'Meet the local riverside guides.');
    const preset = bundled.find((destination) => destination.name === 'Srinagar').local_sightseeing[0];
    assert.equal(enrichDestination({ ...srinagar, local_sightseeing: [preset] }).local_sightseeing[0].client_sentence,
      defaults.Srinagar.sights[preset.name].client_sentence);
  });

  test('maximum-length legacy sightseeing fallback survives validation without truncation', () => {
    const sight = { name: 'V'.repeat(120), description: 'D'.repeat(800), tags: [] };
    const inputRecord = { ...srinagar, id: 'Srinagar', local_sightseeing: [sight], enabled_sightseeing: [sight.name] };
    const saved = validateDestination(inputRecord);
    const sentence = saved.local_sightseeing[0].client_sentence;
    assert.ok(sentence.length > 500 && sentence.length <= 1000);
    const reloaded = validateDestination(JSON.parse(JSON.stringify(saved)));
    assert.equal(reloaded.local_sightseeing[0].client_sentence, sentence);
    assert.equal(reloaded.local_sightseeing[0].name, sight.name);
    assert.equal(reloaded.local_sightseeing[0].description, sight.description);
    assert.throws(() => validateDestination({ ...inputRecord, local_sightseeing: [{ ...sight, client_sentence: 'x'.repeat(1001) }] }), /under 1000 characters/,
      'Client text keeps an explicit bounded validation limit.');
  });

  test('library card, search and editor all use the complete saved About', () => {
    const about = 'An original opening. Another authored sentence.\nOnly this final paragraph contains the cobalt-promenade keyword.';
    const record = { ...srinagar, id: 'Srinagar', day_note: about, description: 'Old summary.' };
    let tree = renderLibrary([record]);
    const card = all(tree, (element) => element.props?.className === 'dest-description');
    assert.equal(card.length, 1);
    assert.equal(text(card[0]), about);
    all(tree, (element) => element.props?.['aria-label'] === 'Search destinations')[0].props.onChange({ target: { value: 'cobalt-promenade' } });
    tree = renderLibrary([record], false);
    assert.equal(all(tree, (element) => element.props?.className === 'dest-description').length, 1,
      'Search must include the third sentence and later paragraphs, not the default summary or a shortened preview.');
    hooks.length = 0; hookIndex = 0;
    const editor = DestinationEditor({ initial: record, onSaved: async () => {} });
    const aboutField = all(editor, (element) => element.type === 'textarea' && element.props.rows === 5)[0];
    assert.equal(aboutField.props.value, about);
  });

  test('descriptive fallback keeps checked sightseeing once and in library order', () => {
    const sights = [
      { name: 'River overlook', description: 'A quiet river vista.', tags: [], visit_minutes: 30, transfer_minutes: 0, arrival_suitable: true },
      { name: 'Garden terrace', description: 'Historic hillside gardens.', tags: [], visit_minutes: 30, transfer_minutes: 0, arrival_suitable: true },
      { name: 'Unchecked shrine', description: 'A riverside shrine.', tags: [], visit_minutes: 30, transfer_minutes: 0, arrival_suitable: true },
    ];
    replaceDestinationCatalog([{ ...srinagar, day_note: 'Discover the local landscape.', local_sightseeing: sights,
      enabled_sightseeing: sights.slice(0, 2).map((sight) => sight.name), activities: [], enabled_activities: [], activity_copy: {}, activity_timing: {} }]);
    const day = { day: 2, date: '2026-10-21', label: 'Sightseeing day', from: 'Srinagar', to: 'Srinagar', stay: 'Srinagar', transfer: false,
      drive: { km: 0, hours: 0, via: [], known: true }, blocks: [], notes: [] };
    const scheduled = scheduleDayPlans(input, [day], emptyQuote);
    const copy = scheduled.map((item) => dayNarrative(item, input.pickup, emptyQuote)).join(' ');
    const sentences = sights.map(sightseeingSentence);
    assert.equal(copy.split(sentences[0]).length - 1, 1);
    assert.equal(copy.split(sentences[1]).length - 1, 1);
    assert.ok(copy.indexOf(sentences[0]) < copy.indexOf(sentences[1]));
    assert.doesNotMatch(copy, /Unchecked shrine/);
    assert.deepEqual(scheduled.flatMap((item) => item.blocks).filter((block) => block.kind === 'sightseeing').map((block) => block.description), sentences.slice(0, 2));
  });
} finally { replaceDestinationCatalog(original); }

async function storeRoundTrip() {
  const fetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SECRET_KEY;
  const rows = new Map();
  process.env.SUPABASE_URL = 'https://destination-content.test';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_destination_content_test';
  global.fetch = async (url, options = {}) => {
    assert.equal(new URL(url).origin, 'https://destination-content.test', 'This test must never contact a real database.');
    assert.equal(options.cache, 'no-store');
    if (options.method === 'POST' || options.method === 'PATCH') {
      const row = JSON.parse(options.body);
      rows.set(row.id, row);
      return Response.json([row]);
    }
    const id = new URL(url).searchParams.get('id');
    return Response.json(id?.startsWith('eq.') ? (rows.has(id.slice(3)) ? [rows.get(id.slice(3))] : []) : [...rows.values()]);
  };
  try {
    const { saveDestination, listDestinations } = require('../lib/destination-store.ts');
    for (const day_note_mode of ['auto', 'manual']) {
      const saved = validateDestination({ ...srinagar, id: 'Srinagar', day_note_mode, day_note: 'Saved manual paragraph.' });
      await saveDestination(saved);
      const loaded = (await listDestinations()).find((destination) => destination.id === 'Srinagar');
      assert.equal(loaded.day_note_mode, day_note_mode);
      assert.equal(destinationAbout(loaded), destinationAbout(saved));
    }
    const legacy = bundled.find((destination) => destination.name === 'Srinagar');
    for (const day_note of [undefined, '', '   ', legacy.description, 'An authored replacement.\nA second paragraph.']) {
      const inputRecord = { ...srinagar, id: 'Srinagar', day_note };
      const saved = validateDestination(inputRecord);
      const expected = day_note === undefined ? defaults.Srinagar.day_note : day_note.trim();
      await saveDestination(saved);
      for (let attempt = 0; attempt < 2; attempt++) {
        const loaded = (await listDestinations()).find((destination) => destination.id === 'Srinagar');
        assert.equal(loaded.day_note, expected);
        assert.equal(destinationAbout(loaded), expected);
        assert.equal(enrichDestination(loaded).day_note, expected);
      }
    }
    checks++;
    console.log('PASS absent, blank and legacy-looking About survive validation and destination-store reloads');
  } catch (error) {
    failures.push({ name: 'destination-store content roundtrip', error });
    console.error(`FAIL destination-store content roundtrip: ${error.stack}`);
  } finally {
    global.fetch = fetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = priorKey;
  }
}
storeRoundTrip().finally(() => {
  if (failures.length) process.exitCode = 1;
  console.log(`Destination content consistency: ${checks} passed, ${failures.length} failed.`);
});
