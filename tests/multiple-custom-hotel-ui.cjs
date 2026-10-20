const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const hooks = [];
let hookIndex = 0;
let planner;
const calls = [];
const resolve = Module._resolveFilename;
const load = Module._load;
Module._resolveFilename = function (request, parent, isMain, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
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
    useEffect() {},
    useMemo: (callback) => callback(),
  };
  if (request === '@/components/PlannerProvider') return { usePlanner: () => planner };
  if (request === 'next/link' || request === '@/components/AppShell' || request === '@/components/PlannerChrome') return { __esModule: true, default: () => null };
  return load.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, filename);
};
require.extensions['.css'] = () => {};
const HotelsPage = require('../app/planner/hotels/page.tsx').default;

const input = { arrival: '2026-12-14', departure: '2026-12-17', adults: 4, youngAges: [], hotelCategory: 'Signature', mealPlan: 'Breakfast & Dinner', hotelOptionMode: 'multiple' };
const masters = ['Primary', 'First alternative', 'Second alternative'].map((name, index) => ({
  id: `hotel-${index}`, destination: 'Srinagar', name, normalizedCategory: 'Signature', sourceCategory: '3 Star', starRating: 3,
  mapB2B: 3000 + index * 1000, extraBedB2B: 500, cnbB2B: 200, roomType: 'Deluxe', rateValidity: '2026-12-01 to 2026-12-31', availabilityStatus: 'Available',
}));
function quote(index, custom = false) {
  return {
    ...(custom && index > 0 ? { customId: `custom-${index}` } : {}), hotelId: custom ? '' : masters[index].id,
    hotelName: custom ? `Custom ${index + 1}` : masters[index].name, category: 'Signature', starRating: custom ? null : 3,
    address: '', roomType: 'Deluxe', website: '', nightlyRate: 3000 + index * 1000, extraBedRate: 500, cnbRate: 200,
    source: custom ? 'Custom hotel' : 'Imported master', status: 'user-edited',
  };
}
function fixture(customSlots = [], sharedCustomRates) {
  const stay = { ...quote(0, customSlots.includes(0)), location: 'Srinagar', nights: 3, rooms: 2, extraBeds: 1, cnb: 0,
    alternatives: [quote(1, customSlots.includes(1)), quote(2, customSlots.includes(2))], ...(sharedCustomRates ? { sharedCustomRates } : {}) };
  return {
    input, hydrated: true, hotelConnection: 'ready', hotelDatabase: masters, hotelSelections: [stay],
    plan: { input, nights: 3, days: 4, hotelPlans: [{ location: 'Srinagar', nights: 3 }], dayPlans: [1, 2, 3, 4].map((day) => ({ day, date: `2026-12-${13 + day}`, stay: 'Srinagar' })) },
    ...Object.fromEntries(['confirmHotelRates', 'replaceHotel', 'replaceHotelAlternative', 'setCustomHotelAlternative', 'useCustomHotel', 'setSharedCustomHotelRate', 'setHotelRate', 'setHotelOptionRate', 'setHotelMeta', 'setSrinagarHouseboatNights', 'refreshHotels'].map((name) => [name, (...args) => calls.push({ name, args })])),
  };
}
function reset(customSlots = [], sharedCustomRates) { hooks.length = 0; calls.length = 0; planner = fixture(customSlots, sharedCustomRates); return render(); }
function render() { hookIndex = 0; return HotelsPage(); }
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
const byLabel = (tree, label) => all(tree, (element) => element.props?.['aria-label'] === label);
const buttons = (tree, label) => all(tree, (element) => element.type === 'button' && text(element) === label);
const rates = (tree) => all(tree, (element) => element.type?.name === 'RateInput');
const rateRequests = (tree) => all(tree, (element) => element.type === 'button' && /^(?:Set|Edit|Review) rate$/.test(text(element)));
let checks = 0;
let failures = 0;
function test(name, run) {
  try { run(); checks++; console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.stack}`); }
}

test('making the primary custom targets only the primary option', () => {
  const tree = reset();
  assert.equal(buttons(tree, 'Use custom hotel').length, 1);
  buttons(tree, 'Use custom hotel')[0].props.onClick();
  assert.deepEqual(calls, [{ name: 'useCustomHotel', args: ['Srinagar'] }], 'The primary action must not clear or convert either suggested alternative.');
});

test('each similar hotel has an independent custom option', () => {
  for (let index = 0; index < 2; index++) {
    const tree = reset();
    const selector = byLabel(tree, `Similar hotel ${index + 1} in Srinagar`)[0];
    assert.ok(selector);
    assert.ok(all(selector, (element) => element.type === 'option' && element.props.value === '').length);
    selector.props.onChange({ target: { value: '' } });
    assert.deepEqual(calls, [{ name: 'setCustomHotelAlternative', args: ['Srinagar', index, {}] }], 'Changing one option must not change the primary or its sibling.');
  }
});

test('three custom options use one shared highest supplier quote', () => {
  const tree = reset([0, 1, 2], { nightlyRate: 5700, extraBedRate: 800, cnbRate: 350 });
  for (const label of ['Custom hotel in Srinagar', 'Custom hotel alternative 1 in Srinagar', 'Custom hotel alternative 2 in Srinagar']) assert.equal(byLabel(tree, label).length, 1);
  assert.equal(rateRequests(tree).length, 0, 'Name-only custom alternatives must not ask for individual supplier rates.');
  assert.equal(rates(tree).length, 3, 'There is one room/extra-bed/CNB bundle, not three independent bundles.');
  assert.deepEqual(rates(tree).map((field) => field.props.value), [5700, 800, 350]);
  assert.match(text(tree), /highest supplier (?:rate|quote)/i);
  const fields = ['nightlyRate', 'extraBedRate', 'cnbRate'];
  rates(tree).forEach((field, index) => field.props.onCommit(6000 + index));
  assert.deepEqual(calls, fields.map((field, index) => ({ name: 'setSharedCustomHotelRate', args: ['Srinagar', field, 6000 + index] })));
});

test('one valid shared quote permits stay verification without individual custom prices', () => {
  reset([0, 1, 2], { nightlyRate: 4200, extraBedRate: 900, cnbRate: 300 });
  const stay = planner.hotelSelections[0];
  for (const option of [stay, ...stay.alternatives]) Object.assign(option, { nightlyRate: 0, extraBedRate: 0, cnbRate: 0 });
  let tree = render();
  const final = all(tree, (element) => element.type?.name === 'HotelFinalConfirmation');
  assert.equal(final.length, 1, 'The single final check lives outside the individual stay editors.');
  const verification = all(final[0].type(), (element) => element.type === 'input' && element.props.type === 'checkbox')[0];
  assert.ok(verification);
  assert.equal(verification.props.disabled, false, 'The shared positive room rate is sufficient for every named custom option.');
  assert.doesNotMatch(text(tree), /Enter the room rate/);
  assert.deepEqual(rates(tree).map((field) => field.props.value), [4200, 900, 300]);
  verification.props.onChange({ target: { checked: true } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { name: 'confirmHotelRates', args: [true] });

  calls.length = 0;
  stay.sharedCustomRates.nightlyRate = 0;
  tree = render();
  const invalidFinal = all(tree, (element) => element.type?.name === 'HotelFinalConfirmation')[0];
  const invalidVerification = all(invalidFinal.type(), (element) => element.type === 'input' && element.props.type === 'checkbox')[0];
  assert.equal(invalidVerification.props.disabled, true, 'An unpriced shared quote cannot be verified.');
  invalidVerification.props.onChange({ target: { checked: true } });
  assert.deepEqual(calls, [], 'The handler also guards invalid shared pricing, beyond the disabled checkbox.');
});

test('editing each custom name leaves every other option untouched', () => {
  const tree = reset([0, 1, 2], { nightlyRate: 5700, extraBedRate: 800, cnbRate: 350 });
  byLabel(tree, 'Custom hotel in Srinagar')[0].props.onChange({ target: { value: 'Primary supplier renamed' } });
  assert.deepEqual(calls, [{ name: 'setHotelMeta', args: ['Srinagar', { hotelName: 'Primary supplier renamed', status: 'user-edited' }] }]);
  for (let index = 0; index < 2; index++) {
    calls.length = 0;
    byLabel(tree, `Custom hotel alternative ${index + 1} in Srinagar`)[0].props.onChange({ target: { value: `Alternative ${index + 1} renamed` } });
    assert.deepEqual(calls, [{ name: 'setCustomHotelAlternative', args: ['Srinagar', index, { hotelName: `Alternative ${index + 1} renamed` }] }]);
  }
});

test('mixed database and custom options retain individual supplier rate review', () => {
  const tree = reset([1]);
  const edit = byLabel(tree, 'Edit rate for Custom 2')[0];
  assert.ok(edit, 'An independent custom quote still has a rate action while other options come from the database.');
  edit.props.onClick();
  const reviewed = render();
  assert.equal(buttons(reviewed, 'Back to highest rate').length, 1);
  assert.deepEqual(rates(reviewed).map((field) => field.props.value), [4000, 500, 200]);
  rates(reviewed)[0].props.onCommit(4500);
  assert.deepEqual(calls, [{ name: 'setHotelOptionRate', args: ['Srinagar', 'custom-1', 'nightlyRate', 4500] }]);
});

test('an old alternative review closes when the last database option becomes custom', () => {
  let tree = reset([0, 1]);
  byLabel(tree, 'Edit rate for Custom 2')[0].props.onClick();
  tree = render();
  assert.equal(buttons(tree, 'Back to highest rate').length, 1);
  planner = fixture([0, 1, 2], { nightlyRate: 6100, extraBedRate: 850, cnbRate: 375 });
  tree = render();
  assert.equal(buttons(tree, 'Back to highest rate').length, 0, 'A stale review target cannot override the shared bundle.');
  assert.equal(rateRequests(tree).length, 0);
  assert.deepEqual(rates(tree).map((field) => field.props.value), [6100, 850, 375]);
  rates(tree)[0].props.onCommit(6200);
  assert.deepEqual(calls, [{ name: 'setSharedCustomHotelRate', args: ['Srinagar', 'nightlyRate', 6200] }]);
});

test('filled database rates remain optional to edit, even with old supplier validity text', () => {
  reset();
  planner.hotelDatabase = planner.hotelDatabase.map((hotel) => ({ ...hotel, rateValidity: 'October 2025' }));
  const tree = render();
  assert.equal(rateRequests(tree).length, 3, 'Every property remains independently editable.');
  assert.equal(buttons(tree, 'Review rate').length, 0);
  assert.equal(buttons(tree, 'Set rate').length, 0);
  const final = all(tree, (element) => element.type?.name === 'HotelFinalConfirmation')[0];
  assert.equal(all(final.type(), (element) => element.type === 'input' && element.props.type === 'checkbox')[0].props.disabled, false);
  const adjustments = all(tree, (element) => element.type === 'details' && element.props.className === 'hotel-adjustments');
  assert.equal(adjustments[0].props.open, false, 'Already-filled rate fields start collapsed.');
});

test('multiple packages render one final confirmation, outside every package editor', () => {
  reset();
  planner = { ...planner, input: { ...planner.input, packagePreferences: ['Signature', 'Signature Plus'] }, plan: { ...planner.plan, input: { ...planner.plan.input, packagePreferences: ['Signature', 'Signature Plus'] } } };
  const comparison = render().type();
  assert.equal(all(comparison, (element) => element.type?.name === 'HotelFinalConfirmation').length, 1);
  const editors = all(comparison, (element) => element.type?.name === 'HotelPackageEditor');
  assert.equal(editors.length, 2);
  for (const editor of editors) assert.equal(all(editor.type(), (element) => element.type?.name === 'HotelFinalConfirmation').length, 0);
});

console.log(`Multiple custom hotel UI: ${checks} interaction regressions passed${failures ? `, ${failures} failed` : ''}.`);
if (failures) process.exitCode = 1;
