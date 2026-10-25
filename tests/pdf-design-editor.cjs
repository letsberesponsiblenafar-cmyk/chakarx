/* Real editor handlers and hook state, with isolated browser/storage/API adapters. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename, originalLoad = Module._load;
let active, planner, previewMode = 'ok';
const applied = [], previews = [], requests = [], revoked = [], prepared = [];
let refreshes = 0, objectId = 0;
const storage = new Map(), events = new Map();
global.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
global.window = { addEventListener: (name, handler) => events.set(name, handler), removeEventListener: (name, handler) => { if (events.get(name) === handler) events.delete(name); } };
URL.createObjectURL = () => `blob:editor-test-${++objectId}`;
URL.revokeObjectURL = url => revoked.push(url);
global.Image = class { naturalWidth = 3000; naturalHeight = 2000; set src(value) { queueMicrotask(() => this.onload()); } };
global.document = { createElement: name => {
  assert.equal(name, 'canvas');
  const canvas = { width: 0, height: 0, getContext: () => ({ clearRect() {}, fillRect() {}, drawImage() {} }),
    toDataURL(type, quality) { prepared.push({ type, quality, width: this.width, height: this.height }); return `data:${type};base64,AAAA`; } };
  return canvas;
} };
Module._resolveFilename = function(request, parent, isMain, options) { return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options); };
Module._load = function(request, parent, isMain) {
  if (request === 'react') return { ...React,
    useState(initial) { const index = active.index++; if (!(index in active.hooks)) active.hooks[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
      const record = active.hooks[index]; return [record.value, next => { record.value = typeof next === 'function' ? next(record.value) : next; }]; },
    useRef(initial) { const index = active.index++; if (!(index in active.hooks)) active.hooks[index] = { kind: 'ref', value: { current: initial } }; return active.hooks[index].value; },
    useEffect(callback, deps) { const index = active.index++, previous = active.hooks[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const record = { kind: 'effect', deps, cleanup: previous?.cleanup }; active.hooks[index] = record;
        active.effects.push(() => { record.cleanup?.(); record.cleanup = callback(); });
      }
    },
  };
  if (request === '@/components/PlannerProvider') return { usePlanner: () => planner };
  if (request === '@/lib/pdf-design-preview') return { renderPdfDesignPreview: async settings => {
    previews.push(structuredClone(settings)); if (previewMode === 'error') throw new Error('Artwork could not be loaded.');
    return { url: URL.createObjectURL(), pageCount: 12 };
  } };
  return originalLoad.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
require.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) }; };
const { defaultPdfDesign, initialPdfDesignLibrary } = require('../lib/pdf-designs.ts');
const { preparePdfImageUpload } = require('../lib/pdf-image-upload.ts');
const Editor = require('../components/PdfDesignEditor.tsx').default;
let cloud = initialPdfDesignLibrary(), getMode = 'ok', putMode = 'ok', uploadMode = 'ok';
const assetUrl = '/api/pdf-design-assets/' + 'a'.repeat(64);
global.fetch = async (url, init = {}) => {
  const method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : undefined;
  requests.push({ url, method, body });
  let status = 200, payload;
  if (url === '/api/pdf-designs' && method === 'GET') {
    if (getMode === 'error') { status = 503; payload = { error: 'Design database unavailable.' }; }
    else payload = { designs: structuredClone(cloud) };
  } else if (url === '/api/pdf-designs' && method === 'PUT') {
    if (putMode === 'conflict') { status = 409; payload = { error: 'A newer design exists.' }; }
    else if (putMode === 'error') { status = 503; payload = { error: 'Design save failed.' }; }
    else {
      assert.equal(body.revision, cloud[body.theme].revision, 'Use the loaded revision, never overwrite blindly.');
      cloud[body.theme] = { settings: structuredClone(body.settings), revision: body.revision + 1, updatedAt: '2026-10-25T10:00:00Z' };
      payload = { design: structuredClone(cloud[body.theme]) };
    }
  } else if (url === '/api/pdf-design-assets' && method === 'POST') {
    if (uploadMode === 'error') { status = 503; payload = { error: 'Image storage unavailable.' }; }
    else payload = { url: assetUrl, name: body.name, width: 2000, height: 1333 };
  } else throw new Error(`Unexpected test network request ${method} ${url}`);
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
};
function walk(value, predicate, result = []) {
  if (Array.isArray(value)) value.forEach(item => walk(item, predicate, result));
  else if (value && typeof value === 'object') { if (predicate(value)) result.push(value); walk(value.props?.children, predicate, result); }
  return result;
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  if (value && typeof value === 'object') return text(value.props?.children);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function render() { active.index = 0; active.effects = []; active.tree = Editor(); const effects = [...active.effects]; effects.forEach(effect => effect()); return active.tree; }
async function settle() { for (let i = 0; i < 5; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } }
function button(label) { const found = walk(active.tree, value => value.type === 'button' && (value.props['aria-label'] === label || text(value).trim() === label)); assert.equal(found.length, 1, `Find exactly one button: ${label}`); return found[0]; }
function input(label) { const found = walk(active.tree, value => value.type === 'input' && (value.props['aria-label'] === label || value.props.id === label)); assert.equal(found.length, 1, `Find exactly one input: ${label}`); return found[0]; }
async function click(label) { const node = button(label); assert.ok(!node.props.disabled, `${label} must be available`); node.props.onClick(); await settle(); }
async function change(label, value) { input(label).props.onChange({ target: { value } }); await settle(); }
async function mount({ keepCloud = false } = {}) {
  if (active) for (const hook of active.hooks) if (hook?.kind === 'effect') hook.cleanup?.();
  active = { hooks: [], index: 0, effects: [] }; getMode = 'ok'; putMode = 'ok'; uploadMode = 'ok'; previewMode = 'ok';
  if (!keepCloud) cloud = initialPdfDesignLibrary();
  planner = { input: { pdfTheme: 'original' }, hydrated: true,
    applyPdfDesign(settings) { applied.push(structuredClone(settings)); planner.input = { pdfTheme: settings.theme, pdfDesign: structuredClone(settings) }; },
    async refreshPdfDesigns() { refreshes++; },
  };
  render(); await settle();
}
let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
async function main() {
  await test('initial themes can be explicitly saved without changing a trip', async () => {
    await mount(); const before = structuredClone(planner.input), applies = applied.length;
    assert.ok(!button('Save design').props.disabled, 'Revision-zero built-in templates must be savable.');
    await click('Save design');
    assert.equal(cloud.original.revision, 1); assert.deepEqual(planner.input, before); assert.equal(applied.length, applies);
    assert.equal(button('Save design').props.disabled, true); assert.ok(refreshes > 0);
  });
  await test('edits remain isolated per theme; apply and cloud save are separate actions', async () => {
    await change('Accent hex colour', '#E3C274'); await click('Winter');
    assert.equal(input('Accent hex colour').props.value, defaultPdfDesign('winter').colors.accent);
    await change('Accent hex colour', '#A3C7D9'); await click('Original');
    assert.equal(input('Accent hex colour').props.value, '#E3C274');
    assert.equal(cloud.original.settings.colors.accent, defaultPdfDesign('original').colors.accent);
    const saves = requests.filter(r => r.method === 'PUT').length;
    await click('Apply to this trip');
    assert.equal(planner.input.pdfDesign.colors.accent, '#E3C274');
    assert.equal(requests.filter(r => r.method === 'PUT').length, saves);
    assert.equal(button('Applied to trip').props.disabled, true);
  });
  await test('unsaved edits survive navigation and preserve a stale revision conflict', async () => {
    assert.ok(storage.size, 'Drafts are kept in this browser session.');
    assert.ok(events.has('beforeunload'), 'Closing the page warns about unsaved edits.');
    cloud.original.revision += 1;
    await mount({ keepCloud: true });
    assert.equal(input('Accent hex colour').props.value, '#E3C274');
    assert.equal(button('Save design').props.disabled, true);
    assert.match(text(active.tree), /changed elsewhere/);
    await click('Winter');
    assert.equal(input('Accent hex colour').props.value, '#A3C7D9');
    assert.equal(button('Save design').props.disabled, false, 'One theme conflict must not block the other.');
    await click('Original'); await click('Reload saved designs');
    assert.match(text(active.tree), /replaces unsaved edits in both themes/);
    await click('Keep editing'); assert.equal(input('Accent hex colour').props.value, '#E3C274');
  });
  await test('invalid colours block save, apply and preview without mutating saved designs', async () => {
    await click('Winter'); await change('Deep tone hex colour', '#FFFFFF');
    for (const label of ['Save design', 'Apply to this trip', 'Generate preview']) assert.equal(button(label).props.disabled, true);
    assert.match(text(active.tree), /darker ink colour/);
    await change('Deep tone hex colour', '#19384B');
  });
  await test('successful previews use the draft, stay visible when stale, and release old URLs', async () => {
    await click('Generate preview'); assert.equal(previews.at(-1).colors.accent, '#A3C7D9');
    assert.equal(walk(active.tree, node => node.type === 'iframe').length, 1);
    assert.match(text(active.tree), /12 pages/);
    const previous = walk(active.tree, node => node.type === 'iframe')[0].props.src.split('#')[0];
    await change('Accent hex colour', '#B7D6E2');
    assert.match(text(active.tree), /previous settings/);
    assert.equal(walk(active.tree, node => node.type === 'iframe').length, 1);
    await click('Update preview'); assert.ok(revoked.includes(previous));
    assert.equal(walk(active.tree, node => node.type === 'a' && node.props.download).length, 1);
    previewMode = 'error'; await click('Update preview'); assert.match(text(active.tree), /Artwork could not be loaded/);
    assert.equal(walk(active.tree, node => node.type === 'iframe').length, 1, 'A preview failure keeps the previous valid PDF.');
  });
  await test('image upload changes only its slot, keeps transparent logos, and resets safely', async () => {
    await click('Cover');
    input('design-image-coverMain').props.onChange({ target: { files: [{ name: 'winter.webp', type: 'image/webp', size: 1000 }], value: 'file' } });
    await settle();
    assert.ok(walk(active.tree, node => node.type === 'img' && node.props.src === assetUrl).length);
    assert.equal(prepared.at(-1).type, 'image/jpeg'); assert.ok(prepared.at(-1).width <= 2000);
    assert.equal(cloud.winter.settings.images.coverMain, defaultPdfDesign('winter').images.coverMain, 'Upload does not save the whole theme.');
    await click('Branding'); input('design-image-logoLight').props.onChange({ target: { files: [{ name: 'logo.png', type: 'image/png', size: 1000 }], value: 'file' } });
    await settle(); assert.equal(prepared.at(-1).type, 'image/png');
    await click('Use original artwork for Logo on dark pages');
    assert.ok(walk(active.tree, node => node.type === 'img' && node.props.src === '/chakar-logo-original-white.png').length);
    uploadMode = 'error'; input('design-image-logoDark').props.onChange({ target: { files: [{ name: 'logo.png', type: 'image/png', size: 1000 }], value: 'file' } });
    await settle(); assert.match(text(active.tree), /Image storage unavailable/);
    assert.ok(walk(active.tree, node => node.type === 'img' && node.props.src === '/chakar-logo-original-ink.png').length, 'Failed uploads keep previous artwork.');
  });
  await test('save failure and conflict retain the draft; reset needs explicit confirmation', async () => {
    putMode = 'error'; await click('Save design'); assert.match(text(active.tree), /Design save failed/);
    assert.equal(cloud.winter.revision, 0); assert.equal(button('Save design').props.disabled, false);
    putMode = 'conflict'; await click('Save design'); assert.equal(button('Save design').props.disabled, true);
    await click('Restore theme defaults'); assert.match(text(active.tree), /changes the draft only/);
    await click('Cancel'); await click('Colours'); assert.equal(input('Accent hex colour').props.value, '#B7D6E2');
    await click('Restore theme defaults'); await click('Restore defaults');
    assert.equal(input('Accent hex colour').props.value, defaultPdfDesign('winter').colors.accent);
    assert.equal(cloud.winter.revision, 0, 'Reset never writes to the database automatically.');
  });
  await test('unavailable database offers local editing but never claims a cloud save', async () => {
    storage.clear(); await mount();
    getMode = 'error';
    // The initial-mount effect owns the actual loading path.
    const initialEffect = active.hooks.find(hook => hook.kind === 'effect'); initialEffect.cleanup?.();
    active = { hooks: [], index: 0, effects: [] }; render(); await settle();
    assert.match(text(active.tree), /Saved designs are unavailable/); assert.equal(button('Save design').props.disabled, true);
    assert.equal(button('Generate preview').props.disabled, false);
  });
  await test('upload preprocessing rejects unsupported and oversized files before decoding', async () => {
    await assert.rejects(() => preparePdfImageUpload({ type: 'image/svg+xml', size: 100 }), /JPG, PNG or WebP/);
    await assert.rejects(() => preparePdfImageUpload({ type: 'image/png', size: 13 * 1024 * 1024 }), /12 MB/);
  });
  console.log(`${checks} PDF design editor checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
