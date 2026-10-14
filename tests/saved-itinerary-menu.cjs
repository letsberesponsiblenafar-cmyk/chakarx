const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const hooks = [];
const effects = [];
let hookIndex = 0;
const plannerLoads = [];
const navigations = [];
let resets = 0;
const originalLoad = Module._load;
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
    useEffect(callback) {
      const index = hookIndex++;
      if (!(index in hooks)) { hooks[index] = true; effects.push(callback); }
    },
    useMemo: (callback) => callback(),
  };
  if (request === 'next/link') return { __esModule: true, default: () => null };
  if (request === 'next/navigation') return { useRouter: () => ({ push: (value) => navigations.push(value) }) };
  if (request === '@/components/AppShell') return { __esModule: true, default: () => null };
  if (request === '@/components/PlannerProvider') return {
    usePlanner: () => ({ loadSavedItinerary: (id, snapshot) => plannerLoads.push({ id, snapshot }), reset: () => { resets++; } }),
  };
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions['.tsx'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, filename);
};
const SavedItineraries = require('../components/SavedItineraries.tsx').default;
const original = {
  id: 'c4851c67-2bc9-4f9e-b48d-6569364baf03', client_name: 'Test client',
  arrival: '2026-12-14', departure: '2026-12-16', days: 3, nights: 2, package_total: 55220,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-03T11:00:00.000Z', last_downloaded_at: '2026-10-03T12:00:00.000Z', download_count: 4,
};
const copied = { ...original, id: 'feab9aed-70e4-42ac-bfa8-46b98f73069b', created_at: '2026-10-14T10:00:00.000Z', updated_at: '2026-10-14T10:00:00.000Z', last_downloaded_at: null, download_count: 0 };
const requests = [];
let completeCopy;
global.fetch = async (url, options = {}) => {
  requests.push({ url, options });
  if (url === '/api/itineraries') return Response.json({ itineraries: [structuredClone(original)] });
  if (url.endsWith('/copy')) return new Promise((resolve) => { completeCopy = resolve; });
  if (url === `/api/itineraries/${copied.id}`) return Response.json({ itinerary: { id: copied.id, snapshot: { plan: { days: 3 }, input: { name: 'Test client' } } } });
  throw new Error(`Unexpected request: ${url}`);
};
function render() { hookIndex = 0; return SavedItineraries(); }
function all(element, predicate) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap((item) => all(item, predicate));
  return [...(predicate(element) ? [element] : []), ...all(element.props?.children, predicate)];
}
function menus(tree) { return all(tree, (element) => element.type?.name === 'ItineraryMenu'); }
function cards(tree) { return all(tree, (element) => element.type === 'article'); }
const settle = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  render();
  effects.splice(0).forEach((callback) => callback());
  await settle();
  let tree = render();
  assert.equal(menus(tree).length, 1, 'Every saved itinerary has its own three-dot menu.');
  const sourceMenu = menus(tree)[0];
  sourceMenu.props.onToggle();
  tree = render();
  assert.equal(menus(tree)[0].props.expanded, true);
  menus(tree)[0].props.onCopy();
  menus(tree)[0].props.onCopy();
  assert.equal(requests.filter((request) => request.url.endsWith('/copy')).length, 1, 'An immediate second click cannot create a duplicate request before React rerenders.');
  tree = render();
  assert.equal(menus(tree)[0].props.expanded, false);
  assert.equal(menus(tree)[0].props.copying, true);
  assert.equal(menus(tree)[0].props.busy, true);
  assert.ok(all(tree, (element) => element.type === 'button').every((button) => button.props.disabled), 'Open, PDF and Build New remain guarded while the copy is pending.');
  completeCopy(Response.json({ error: 'Database unavailable' }, { status: 503 }));
  await settle();
  tree = render();
  assert.equal(cards(tree).length, 1, 'A failed copy does not add a phantom itinerary card.');
  assert.equal(menus(tree)[0].props.busy, false, 'Failure releases the action guard so the user can retry.');
  assert.equal(all(tree, (element) => element.props?.role === 'alert')[0].props.children, 'Database unavailable');
  assert.deepEqual(plannerLoads, []);
  assert.deepEqual(navigations, []);
  assert.equal(resets, 0);

  menus(tree)[0].props.onCopy();
  completeCopy(Response.json({ itinerary: copied }, { status: 201 }));
  await settle();
  tree = render();
  assert.equal(cards(tree).length, 2);
  assert.equal(cards(tree)[0].key, copied.id, 'The new copy is placed under its fresh creation date.');
  assert.equal(cards(tree)[1].key, original.id);
  assert.deepEqual(menus(tree).find((element) => element.props.item.id === original.id).props.item, original, 'The original card remains unchanged.');
  assert.ok(menus(tree).every((element) => !element.props.busy));
  assert.deepEqual(plannerLoads, [], 'Creating a copy must not load it into or alter the current planner.');
  assert.deepEqual(navigations, [], 'Creating a copy keeps the user in Saved Itineraries.');
  assert.equal(resets, 0);
  const newCard = cards(tree).find((element) => element.key === copied.id);
  const openButton = all(newCard, (element) => element.type === 'button' && element.props.children?.[0] === 'Open & edit ')[0];
  assert.ok(openButton);
  await openButton.props.onClick();
  assert.equal(plannerLoads[0].id, copied.id, 'Opening the copied card targets its new saved ID, so later saves edit only the copy.');
  assert.deepEqual(navigations, ['/planner/destinations']);
  console.log('Saved itinerary menu interactions: one request per pending action, failure/retry, separate card, planner preservation and copy-specific editing passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
