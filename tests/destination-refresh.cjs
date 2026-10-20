const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const hooks = [];
let hookIndex = 0;
Module._resolveFilename = function (request, parent, isMain, options) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
Module._load = function (request, parent, isMain) {
  if (request === 'react') return {
    ...React,
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    // This harness exercises the provider's real refresh callbacks without
    // mounting browser effects or reading a user's local draft/session.
    useEffect() {},
    useMemo: (callback) => callback(),
  };
  return originalLoad.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
const data = require('../lib/data.ts');
const { PlannerProvider } = require('../components/PlannerProvider.tsx');
const { observeDestinationFreshness } = require('../lib/destination-freshness.ts');
const originalCatalog = [...data.destinations];
const originalArchived = data.archivedDestinationCatalog();
const first = originalCatalog[0];
const newest = { ...first, day_note: 'Newest confirmed introduction.', enabled_sightseeing: [] };
const older = { ...first, day_note: 'An older response that arrived late.' };
const requests = [];
global.fetch = (url, options) => {
  assert.equal(url, '/api/destinations');
  assert.equal(options.cache, 'no-store');
  assert.ok(options.signal);
  return new Promise((resolve, reject) => requests.push({ resolve, reject }));
};
function render() { hookIndex = 0; return PlannerProvider({ children: null }).props.value; }
function response(destination) { return Response.json({ destinations: [destination], archivedDestinations: [] }); }
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }

(async () => {
  await check('background checks cannot expose or refresh unconfirmed starter data', async () => {
    assert.equal(await render().refreshDestinations(false, { background: true }), false);
    assert.equal(requests.length, 0);
    assert.equal(render().destinationConnection, 'loading');
  });
  await check('a slower catalogue response cannot overwrite a newer confirmed response', async () => {
    let planner = render();
    const firstRead = planner.refreshDestinations();
    const secondRead = planner.refreshDestinations(true);
    assert.equal(render().destinationConnection, 'loading');
    requests[1].resolve(response(newest));
    assert.equal(await secondRead, true);
    planner = render();
    assert.equal(planner.destinationConnection, 'ready');
    assert.equal(planner.destinationCatalog[0].day_note, newest.day_note);
    requests[0].resolve(response(older));
    assert.equal(await firstRead, false, 'A superseded request cannot claim a verified save refresh.');
    planner = render();
    assert.equal(planner.destinationCatalog[0].day_note, newest.day_note);
    assert.equal(data.destinations[0].day_note, newest.day_note, 'The shared planner catalogue must also reject stale data.');
    assert.deepEqual(data.destinations[0].enabled_sightseeing, [], 'An explicit empty selection must survive refresh.');
  });
  await check('a stale read failure cannot replace newer ready status with an error', async () => {
    const planner = render();
    const oldRead = planner.refreshDestinations();
    const currentRead = planner.refreshDestinations();
    requests[3].resolve(response(newest));
    assert.equal(await currentRead, true);
    requests[2].reject(new Error('Old request timed out.'));
    assert.equal(await oldRead, false);
    assert.equal(render().destinationConnection, 'ready');
    assert.equal(render().destinationConnectionError, '');
  });
  await check('a failed latest read returns false and retains the last confirmed catalogue', async () => {
    const read = render().refreshDestinations(true);
    requests[4].resolve(Response.json({ error: 'Database unavailable.' }, { status: 503 }));
    assert.equal(await read, false);
    const planner = render();
    assert.equal(planner.destinationConnection, 'error');
    assert.equal(planner.destinationConnectionError, 'Database unavailable.');
    assert.equal(planner.destinationCatalog[0].day_note, newest.day_note);
    assert.equal(data.destinations[0].day_note, newest.day_note);
  });
  await check('invalid payloads fail closed and a subsequent Retry can recover', async () => {
    let read = render().refreshDestinations();
    requests[5].resolve(Response.json({ destinations: null }));
    assert.equal(await read, false);
    assert.match(render().destinationConnectionError, /invalid response/);
    read = render().refreshDestinations();
    requests[6].resolve(response(newest));
    assert.equal(await read, true);
    assert.equal(render().destinationConnection, 'ready');
    assert.equal(render().destinationConnectionError, '');
  });
  await check('a pending read cannot resurrect a locally removed destination', async () => {
    const planner = render();
    const read = planner.refreshDestinations();
    planner.removeDestinationFromLibrary(newest);
    requests[7].resolve(response(newest));
    assert.equal(await read, false);
    assert.equal(render().destinationCatalog.length, 0);
    assert.equal(data.destinations.length, 0);
    assert.ok(data.archivedDestinationCatalog().some((item) => item.name === newest.name));
  });

  await check('background refresh stays visible, deduplicates pending checks and cannot supersede a foreground save refresh', async () => {
      let read = render().refreshDestinations();
      requests.at(-1).resolve(response(newest));
      assert.equal(await read, true);
      let before = requests.length;
      read = render().refreshDestinations(false, { background: true });
      assert.equal(render().destinationConnection, 'ready', 'A background check must not hide confirmed cards or unmount pages.');
      assert.equal(render().destinationRefreshing, true);
      assert.equal(await render().refreshDestinations(false, { background: true }), false);
      assert.equal(requests.length, before + 1, 'Only one background request may be active.');
      requests.at(-1).resolve(response(older));
      assert.equal(await read, true);
      assert.equal(render().destinationRefreshing, false);
      assert.equal(render().destinationCatalog[0].day_note, older.day_note);
      read = render().refreshDestinations(true);
      before = requests.length;
      assert.equal(await render().refreshDestinations(false, { background: true }), false);
      assert.equal(requests.length, before, 'A focus event must not supersede an explicit save verification.');
      requests.at(-1).resolve(response(newest));
      assert.equal(await read, true);
      read = render().refreshDestinations(false, { background: true });
      requests.at(-1).reject(new Error('Temporary background timeout.'));
      assert.equal(await read, false);
      assert.equal(render().destinationConnection, 'ready');
      assert.equal(render().destinationRefreshing, false);
      assert.equal(render().destinationCatalog[0].day_note, newest.day_note);
      assert.match(render().destinationConnectionError, /background timeout/);
  });

  await check('focus, visibility and reconnect refresh only the visible library, and listeners are cleaned up', async () => {
    const browser = new EventTarget();
    browser.location = { pathname: '/library' };
    const page = new EventTarget();
    page.visibilityState = 'visible';
    let refreshes = 0;
    const cleanup = observeDestinationFreshness(browser, page, () => { refreshes++; });
    browser.dispatchEvent(new Event('focus'));
    page.dispatchEvent(new Event('visibilitychange'));
    browser.dispatchEvent(new Event('online'));
    assert.equal(refreshes, 3);
    page.visibilityState = 'hidden';
    browser.dispatchEvent(new Event('focus'));
    assert.equal(refreshes, 3);
    page.visibilityState = 'visible';
    for (const pathname of ['/library/Srinagar/edit', '/library/new', '/planner/itinerary']) {
      browser.location.pathname = pathname;
      browser.dispatchEvent(new Event('focus'));
      page.dispatchEvent(new Event('visibilitychange'));
    }
    assert.equal(refreshes, 3, 'Background updates must not interrupt editable drafts or planner work.');
    browser.location.pathname = '/library';
    cleanup();
    browser.dispatchEvent(new Event('focus'));
    page.dispatchEvent(new Event('visibilitychange'));
    browser.dispatchEvent(new Event('online'));
    assert.equal(refreshes, 3);
  });
  console.log(`${checks} destination refresh race, failure and recovery checks passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { data.replaceDestinationCatalog(originalCatalog); data.replaceArchivedDestinationCatalog(originalArchived); });
