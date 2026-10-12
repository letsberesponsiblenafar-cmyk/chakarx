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
let authenticated = true;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  if (request === '@/lib/admin-auth') return {
    isAdmin: async () => authenticated,
    sameOrigin: (request) => request.headers.get('origin') === new URL(request.url).origin,
  };
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true,
  } }).outputText, filename);
};
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const { destinations } = require('../lib/data.ts');
const { initialPackageDefaults, PACKAGE_DEFAULTS_RECORD_ID } = require('../lib/package-defaults.ts');
const { loadPackageDefaults, savePackageDefaults, listDestinations, saveDestination } = require('../lib/destination-store.ts');
const route = require('../app/api/package-defaults/route.ts');
const rows = new Map();
const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  assert.match(url, /\/rest\/v1\/destination_master/);
  assert.equal(options.cache, 'no-store');
  assert.ok(!options.headers.Authorization, 'A Supabase secret key is not a JWT bearer token.');
  if (options.method === 'POST') {
    const row = JSON.parse(options.body);
    if (options.headers.Prefer?.includes('ignore-duplicates') && rows.has(row.id)) return Response.json([]);
    rows.set(row.id, row);
    if (options.headers.Prefer?.includes('return=representation')) return Response.json([row]);
    return new Response(null, { status: 201 });
  }
  if (options.method === 'PATCH') {
    const row = JSON.parse(options.body);
    if (!rows.has(row.id) || rows.get(row.id).record.kind === 'deleted-destination') return Response.json([]);
    rows.set(row.id, row);
    return Response.json([row]);
  }
  if (url.includes(`id=eq.${PACKAGE_DEFAULTS_RECORD_ID}`)) return Response.json(rows.has(PACKAGE_DEFAULTS_RECORD_ID) ? [rows.get(PACKAGE_DEFAULTS_RECORD_ID)] : []);
  // Deliberately return the settings row even when the URL filters it. The
  // application must also reject it before destination enrichment.
  return Response.json([...rows.values()]);
};
const request = (value, origin = 'https://chakar.test') => new Request('https://chakar.test/api/package-defaults', {
  method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value),
});

(async () => {
  assert.deepEqual(await loadPackageDefaults(), initialPackageDefaults(), 'Existing databases need no manual settings migration.');
  const edited = { included: ['  Welcome hamper.  ', 'Welcome hamper'], excluded: ['Airfare.'] };
  const saved = await savePackageDefaults(edited);
  assert.deepEqual(saved, { included: ['Welcome hamper.'], excluded: ['Airfare.'] });
  assert.equal(rows.get(PACKAGE_DEFAULTS_RECORD_ID).record.kind, 'package-defaults');
  assert.deepEqual(await loadPackageDefaults(), saved, 'The common list survives a subsequent server refresh.');
  rows.set('test-valley', { id: 'test-valley', record: { ...destinations[0], name: 'Test Valley', id: 'test-valley' } });
  const catalogue = await listDestinations();
  assert.equal(catalogue.length, destinations.length + 1);
  assert.ok(catalogue.some((item) => item.name === 'Test Valley'));
  assert.ok(!catalogue.some((item) => item.id === PACKAGE_DEFAULTS_RECORD_ID), 'Settings must never be treated as a destination.');
  assert.ok(calls.some((call) => call.url.includes(`id=neq.${PACKAGE_DEFAULTS_RECORD_ID}`)), 'The server query also filters the reserved settings record.');
  await assert.rejects(saveDestination({ ...destinations[0], id: PACKAGE_DEFAULTS_RECORD_ID }), /reserved/);

  authenticated = false;
  let before = calls.length;
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.PUT(request(saved))).status, 401);
  assert.equal(calls.length, before, 'Unauthenticated access never reaches the database.');
  authenticated = true;
  assert.equal((await route.PUT(request(saved, 'https://other.test'))).status, 403);
  assert.equal(calls.length, before, 'Cross-origin updates never reach the database.');
  assert.equal((await route.PUT(request({ included: ['Flights'], excluded: ['Airfare.'] }))).status, 400);
  assert.equal(calls.length, before, 'Conflicting settings are rejected before writing.');
  const cleared = await route.PUT(request({ included: [], excluded: [] }));
  assert.equal(cleared.status, 200);
  assert.deepEqual((await cleared.json()).packageDefaults, { included: [], excluded: [] });
  const refreshed = await route.GET();
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await refreshed.json()).packageDefaults, { included: [], excluded: [] }, 'Explicitly cleared common lists remain cleared after refresh.');
  global.fetch = async () => new Response('temporarily unavailable', { status: 503 });
  assert.equal((await route.GET()).status, 503, 'A failed settings fetch must not silently return the initial list.');
  console.log('Shared package defaults persistence, empty-list refresh, destination isolation and admin/origin guards passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
