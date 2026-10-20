const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let planner;
let routeId;
let hookIndex = 0;
let dirty = false;
const hooks = [];
const effects = [];
const navigations = [];
function EditorMarker() {}
function WrapperMarker() {}
Module._resolveFilename = function (request, parent, isMain, options) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
Module._load = function (request, parent, isMain) {
  if (request === 'react') return {
    ...React,
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value) => {
        const next = typeof value === 'function' ? value(hooks[index]) : value;
        if (!Object.is(next, hooks[index])) { hooks[index] = next; dirty = true; }
      }];
    },
    useEffect(callback, dependencies) {
      const index = hookIndex++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, position) => !Object.is(value, previous[position]))) {
        hooks[index] = dependencies;
        effects.push(callback);
      }
    },
  };
  if (request === '@/components/PlannerProvider') return { usePlanner: () => planner };
  if (request === 'next/navigation') return {
    useParams: () => ({ id: routeId }),
    useRouter: () => ({ push: (href) => navigations.push(href), replace: (href) => navigations.push(href) }),
  };
  if (request === 'next/link' || request === '@/components/AppShell' || request === '@/components/DestinationEditor') {
    return { __esModule: true, default: request === '@/components/DestinationEditor' ? EditorMarker : WrapperMarker };
  }
  return originalLoad.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
require.extensions['.css'] = () => {};

const { destinations } = require('../lib/data.ts');
const { destinationFromRoute } = require('../lib/destination-route.ts');
const { getDynamicParam } = require('next/dist/shared/lib/router/utils/get-dynamic-param');
const { getSelectedParams } = require('next/dist/client/components/router-reducer/compute-changed-path');
const DetailPage = require('../app/library/[id]/page.tsx').default;
const EditPage = require('../app/library/[id]/edit/page.tsx').default;
const NewPage = require('../app/library/new/page.tsx').default;

function all(element, predicate) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap((item) => all(item, predicate));
  return [...(predicate(element) ? [element] : []), ...all(element.props?.children, predicate)];
}
function text(element) {
  if (element == null || typeof element === 'boolean') return '';
  if (Array.isArray(element)) return element.map(text).join(' ');
  return typeof element === 'object' ? text(element.props?.children) : String(element);
}
function reset(status = 'ready') {
  hooks.length = 0; effects.length = 0; navigations.length = 0;
  routeId = 'Sinthan%20Top';
  planner = { destinationCatalog: [saved], destinationConnection: status, destinationConnectionError: '',
    refreshDestinations: async () => true, removeDestinationFromLibrary: () => {} };
}
function render(Page, flushEffects = true) {
  let tree;
  let count = 0;
  do {
    hookIndex = 0; dirty = false;
    tree = Page();
    if (!flushEffects) break;
    while (effects.length) effects.shift()();
    assert.ok(++count < 6, 'The page must settle after effects.');
  } while (dirty);
  return tree;
}
const saved = { ...destinations.find((item) => item.name === 'Sinthan Top'), id: 'Sinthan Top',
  day_note: 'Saved Sinthan introduction.', photoQuery: '',
  local_sightseeing: [
    { name: 'Second named stop', description: '', tags: [], client_sentence: 'See the first saved view.' },
    { name: 'First named stop', description: '', tags: [], client_sentence: 'See the next saved view.' },
  ], enabled_sightseeing: ['Second named stop', 'First named stop'], activities: [], enabled_activities: [] };
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }

check('every bundled guide resolves through the actual Next App Router parameter representation', () => {
  for (const destination of destinations) {
    const id = destination.id || destination.name;
    const dynamic = getDynamicParam({ id }, 'id', 'd', null, null);
    const tree = ['', { children: ['library', { children: [dynamic.treeSegment, { children: ['__PAGE__', {}] }] }] }];
    const parameter = getSelectedParams(tree).id;
    assert.equal(destinationFromRoute(destinations, parameter), destination, id);
    assert.equal(destinationFromRoute(destinations, id), destination, `Decoded: ${id}`);
  }
});
check('raw IDs take priority and encoded names decode only once', () => {
  const literal = { ...saved, id: 'Sinthan%20Top', name: 'Literal encoded ID' };
  assert.equal(destinationFromRoute([saved, literal], 'Sinthan%20Top'), literal);
  assert.equal(destinationFromRoute([saved], 'Sinthan%2520Top'), undefined);
  assert.equal(destinationFromRoute([literal], 'Sinthan%2520Top'), literal);
  assert.equal(destinationFromRoute([saved], undefined), undefined);
});
check('special characters and malformed escapes do not crash destination lookup', () => {
  for (const name of ['Kashmir & Beyond', '100% Valley', 'वैली', 'A/B']) {
    const destination = { ...saved, id: name, name };
    assert.equal(destinationFromRoute([destination], encodeURIComponent(name)), destination);
  }
  assert.equal(destinationFromRoute([saved], '%E0%A4%A'), undefined);
  const literal = { ...saved, id: 'Invalid%escape' };
  assert.equal(destinationFromRoute([literal], 'Invalid%escape'), literal);
});
check('matched detail waits for the saved catalog instead of displaying bundled content', () => {
  reset('loading');
  const tree = render(DetailPage);
  assert.match(text(tree), /Loading destination/);
  assert.doesNotMatch(text(tree), /Saved Sinthan introduction|Things to do|Edit destination/);
  assert.equal(all(tree, (element) => element.type === 'input').length, 0);
});
check('matched detail fails closed with a useful error and working Retry', () => {
  reset('error');
  planner.destinationConnectionError = 'Destination database request failed (503).';
  let retries = 0; planner.refreshDestinations = () => { retries++; return Promise.resolve(); };
  const tree = render(DetailPage);
  assert.match(text(tree), /Could not load destination/);
  assert.match(text(tree), /Destination database request failed \(503\)/);
  assert.doesNotMatch(text(tree), /Saved Sinthan introduction|Edit destination/);
  assert.equal(all(tree, (element) => element.props?.role === 'alert').length, 1);
  all(tree, (element) => element.type === 'button' && text(element) === 'Retry connection')[0].props.onClick();
  assert.equal(retries, 1);
});
check('ready encoded guide displays saved About and sightseeing in library order', () => {
  reset();
  const tree = render(DetailPage);
  assert.match(text(tree), /Saved Sinthan introduction/);
  assert.match(text(tree), /Checked places appear after the introduction/);
  assert.equal(all(tree, (element) => element.type === 'button' && /Use automatic description/.test(text(element))).length, 0);
  const labels = all(tree, (element) => element.type === 'label' && element.props?.className?.startsWith('destination-'));
  assert.deepEqual(labels.map((element) => all(element, (child) => child.type === 'b').map(text)[0]), ['Second named stop', 'First named stop']);
  assert.equal(all(tree, (element) => element.props?.href === '/library/Sinthan%20Top/edit').length, 2);
});
check('changing guide routes cannot flash the previous destination or optimistic selections', () => {
  reset(); render(DetailPage);
  routeId = 'Wular%20Lake';
  planner.destinationCatalog = [saved, { ...saved, id: 'Wular Lake', name: 'Wular Lake', day_note: 'Saved Wular introduction.' }];
  const tree = render(DetailPage, false);
  assert.match(text(tree), /Saved Wular introduction/);
  assert.doesNotMatch(text(tree), /Saved Sinthan introduction/);
});
check('unknown guides report not found only after a successful catalog load', () => {
  reset(); routeId = 'Not%20a%20guide';
  const tree = render(DetailPage);
  assert.match(text(tree), /Destination not found/);
  assert.equal(all(tree, (element) => element.type === 'button' && text(element) === 'Retry connection').length, 0);
});
check('edit route cannot mount an editor while the database is loading or failed', () => {
  for (const status of ['loading', 'error']) {
    reset(status);
    const tree = render(EditPage);
    assert.equal(all(tree, (element) => element.type === EditorMarker).length, 0);
    assert.match(text(tree), status === 'loading' ? /Loading saved details before editing/ : /Could not load destination/);
  }
});
check('edit retry mounts the saved multiword record only after readiness', () => {
  reset('error');
  planner.refreshDestinations = () => { planner.destinationConnection = 'ready'; return Promise.resolve(); };
  let tree = render(EditPage);
  all(tree, (element) => element.type === 'button' && text(element) === 'Retry connection')[0].props.onClick();
  tree = render(EditPage);
  const editor = all(tree, (element) => element.type === EditorMarker)[0];
  assert.equal(editor.props.initial, saved);
  assert.equal(editor.props.initial.day_note, 'Saved Sinthan introduction.');
});
check('confirmed edit draft remains in the same keyed form while refresh is loading or failed', () => {
  reset();
  let tree = render(EditPage);
  const initialEditor = all(tree, (element) => element.type === EditorMarker)[0];
  for (const status of ['loading', 'error']) {
    planner.destinationConnection = status;
    tree = render(EditPage);
    const editor = all(tree, (element) => element.type === EditorMarker)[0];
    assert.equal(editor.type, initialEditor.type);
    assert.equal(editor.key, initialEditor.key);
    assert.equal(editor.props.initial, initialEditor.props.initial);
    const form = all(tree, (element) => element.type === 'fieldset' && element.props.children?.type === EditorMarker)[0];
    assert.equal(form.props.disabled, true);
    assert.match(text(tree), /Your draft is kept below/);
  }
  planner.destinationConnection = 'ready';
  tree = render(EditPage);
  const form = all(tree, (element) => element.type === 'fieldset' && element.props.children?.type === EditorMarker)[0];
  assert.equal(form.props.disabled, false);
  assert.equal(form.props.children.key, initialEditor.key);
});
check('new destination draft remains mounted and disabled while connection is unavailable', () => {
  reset();
  const initialEditor = all(render(NewPage), (element) => element.type === EditorMarker)[0];
  for (const status of ['loading', 'error']) {
    planner.destinationConnection = status;
    const tree = render(NewPage);
    const editor = all(tree, (element) => element.type === EditorMarker)[0];
    assert.equal(editor.type, initialEditor.type);
    assert.equal(editor.key, initialEditor.key);
    const form = all(tree, (element) => element.type === 'fieldset' && element.props.children?.type === EditorMarker)[0];
    assert.equal(form.props.disabled, true);
    assert.match(text(tree), /Your draft is kept below/);
  }
});

(async () => {
  const originalFetch = global.fetch;
  try {
    reset();
    const writes = [];
    const refreshes = [];
    global.fetch = async (url, init) => {
      assert.equal(url, '/api/destinations');
      assert.equal(init.method, 'POST');
      writes.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({}) };
    };
    planner.refreshDestinations = async (rebuild) => {
      refreshes.push(rebuild);
      planner.destinationCatalog = [writes.at(-1)];
      return true;
    };
    let tree = render(DetailPage);
    all(tree, (element) => element.type === 'input' && element.props.type === 'checkbox')[0].props.onChange();
    await new Promise(setImmediate);
    tree = render(DetailPage);
    assert.deepEqual(writes[0].enabled_sightseeing, ['First named stop']);
    assert.deepEqual(writes[0].local_sightseeing.map((sight) => sight.name), ['Second named stop', 'First named stop']);
    assert.deepEqual(refreshes, [true]);
    assert.deepEqual(all(tree, (element) => element.type === 'input' && element.props.type === 'checkbox').map((element) => element.props.checked), [false, true]);
    checks++; console.log('PASS selection writes preserve library order and refresh the current itinerary');

    global.fetch = async () => ({ ok: false, json: async () => ({ error: 'Could not save the selection.' }) });
    all(tree, (element) => element.type === 'input' && element.props.type === 'checkbox')[1].props.onChange();
    await new Promise(setImmediate);
    tree = render(DetailPage);
    assert.match(text(tree), /Could not save the selection/);
    assert.deepEqual(all(tree, (element) => element.type === 'input' && element.props.type === 'checkbox').map((element) => element.props.checked), [false, true]);
    checks++; console.log('PASS failed selection writes restore the prior choices and show the error');

    for (const Page of [EditPage, NewPage]) {
      reset();
      let page = render(Page);
      let editor = all(page, (element) => element.type === EditorMarker)[0];
      planner.refreshDestinations = async () => {
        planner.destinationConnection = 'error';
        planner.destinationConnectionError = 'Refresh failed.';
        return false;
      };
      // Re-render with the current provider callback, as real context updates do.
      page = render(Page);
      editor = all(page, (element) => element.type === EditorMarker)[0];
      await assert.rejects(() => editor.props.onSaved(saved), /Destination saved, but the updated library could not be loaded/);
      assert.deepEqual(navigations, [], 'Failed refresh must not navigate away from the draft.');
      page = render(Page);
      const retained = all(page, (element) => element.type === EditorMarker)[0];
      assert.equal(retained.type, editor.type);
      assert.equal(retained.key, editor.key);
      assert.match(text(page), /Your draft is kept below/);
      planner.destinationConnection = 'ready';
      planner.refreshDestinations = async () => true;
      page = render(Page);
      await all(page, (element) => element.type === EditorMarker)[0].props.onSaved(saved);
      assert.deepEqual(navigations, ['/library/Sinthan%20Top']);
    }
    checks++; console.log('PASS edit and new saves retain drafts without navigation on failed refresh, and navigate on confirmed success');
    console.log(`${checks} destination route and UI checks passed.`);
  } finally { global.fetch = originalFetch; }
})().catch((error) => { console.error(error); process.exitCode = 1; });
