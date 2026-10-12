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
const { PACKAGE_DEFAULTS_RECORD_ID } = require('../lib/package-defaults.ts');
const { listDestinations, saveDestination, deleteDestination, loadPackageDefaults, savePackageDefaults } = require('../lib/destination-store.ts');
const deletionRoute = require('../app/api/destinations/[id]/route.ts');
const collectionRoute = require('../app/api/destinations/route.ts');
const rows = new Map();
const calls = [];
let failDatabase = false;
let deleteBeforeSave = false;
global.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  assert.match(url, /\/rest\/v1\/destination_master/);
  assert.equal(options.cache, 'no-store');
  assert.ok(!options.headers.Authorization, 'Supabase secret keys must not be treated as JWT bearer tokens.');
  if (failDatabase) return new Response('temporarily unavailable', { status: 503 });
  if (options.method === 'POST' || options.method === 'PATCH') {
    const row = JSON.parse(options.body);
    if (deleteBeforeSave && row.record.kind !== 'deleted-destination') {
      deleteBeforeSave = false;
      rows.set(row.id, { ...row, record: { ...row.record, kind: 'deleted-destination', deleted_at: new Date().toISOString() } });
    }
    if (options.method === 'PATCH') {
      assert.ok(url.includes('record->>kind=is.null'), 'Updates must exclude tombstones atomically at write time.');
      if (!rows.has(row.id) || rows.get(row.id).record.kind === 'deleted-destination') return Response.json([]);
    }
    if (options.headers.Prefer?.includes('ignore-duplicates') && rows.has(row.id)) return Response.json([]);
    rows.set(row.id, row);
    if (options.headers.Prefer?.includes('return=representation')) return Response.json([row]);
    return new Response(null, { status: 201 });
  }
  const filter = new URL(url).searchParams.get('id');
  if (filter?.startsWith('eq.')) {
    const id = filter.slice(3);
    return Response.json(rows.has(id) ? [rows.get(id)] : []);
  }
  // Include the reserved row even when the query filters it. Application-side
  // filtering must protect the settings record as well as the REST query.
  return Response.json([...rows.values()]);
};

const writeCount = () => calls.filter((call) => call.options.method === 'POST' || call.options.method === 'DELETE' || call.options.method === 'PATCH').length;
const context = (id) => ({ params: Promise.resolve({ id }) });
const request = (value, origin = 'https://chakar.test') => new Request('https://chakar.test/api/destinations/test', {
  method: 'DELETE', headers: { Origin: origin, 'Content-Type': 'application/json' },
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});

(async () => {
  const initial = await listDestinations();
  assert.equal(initial.length, destinations.length);
  const seeded = initial[0];
  const custom = { ...initial[1], id: 'test-custom-valley', name: 'Test Custom Valley' };
  const defaults = await savePackageDefaults({ included: ['Welcome hamper.'], excluded: ['Airfare.'] });
  const settingsBefore = JSON.stringify(rows.get(PACKAGE_DEFAULTS_RECORD_ID));
  await saveDestination(custom);
  assert.ok((await listDestinations()).some((item) => item.id === custom.id));

  await deleteDestination(seeded);
  const seededTombstone = rows.get(seeded.id);
  assert.equal(seededTombstone.record.kind, 'deleted-destination');
  assert.equal(seededTombstone.record.name, seeded.name, 'Deletion retains a snapshot of the removed catalogue record.');
  assert.ok(Number.isFinite(Date.parse(seededTombstone.record.deleted_at)), 'The deletion timestamp must be persisted.');
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.ok(!(await listDestinations()).some((item) => item.id === seeded.id), 'A deleted bundled destination must not reappear on a later fetch.');
  }
  await deleteDestination(custom);
  assert.equal(rows.get(custom.id).record.kind, 'deleted-destination');
  const afterBoth = await listDestinations();
  assert.ok(!afterBoth.some((item) => item.id === custom.id), 'Custom destination deletion persists after a refresh.');
  assert.equal(afterBoth.length, initial.length - 1, 'Deleting a seed and a custom record leaves the other seeds untouched.');
  const refreshedCatalog = await collectionRoute.GET();
  assert.equal(refreshedCatalog.status, 200);
  const catalogPayload = await refreshedCatalog.json();
  assert.equal(catalogPayload.destinations.length, afterBoth.length);
  assert.deepEqual(catalogPayload.archivedDestinations.map((item) => item.id).sort(), [seeded.id, custom.id].sort(), 'Removed guides are returned separately for existing quote compatibility, never as active destinations.');
  assert.deepEqual(await loadPackageDefaults(), defaults);
  assert.equal(JSON.stringify(rows.get(PACKAGE_DEFAULTS_RECORD_ID)), settingsBefore, 'Destination deletion must not change shared inclusions and exclusions.');

  let beforeWrites = writeCount();
  await assert.rejects(saveDestination(custom), /delet/i, 'An old editor must not recreate a destination that has been deleted.');
  await assert.rejects(saveDestination(seeded), /delet/i, 'Deleted bundled records must also reject stale saves.');
  await assert.rejects(saveDestination({ ...custom, id: PACKAGE_DEFAULTS_RECORD_ID }), /reserved/i);
  await assert.rejects(deleteDestination({ ...custom, id: PACKAGE_DEFAULTS_RECORD_ID }), /reserved/i);
  assert.equal(writeCount(), beforeWrites, 'Protected and stale operations must never write to the database.');
  assert.equal(JSON.stringify(rows.get(PACKAGE_DEFAULTS_RECORD_ID)), settingsBefore);
  const staleSave = await collectionRoute.POST(new Request('https://chakar.test/api/destinations', {
    method: 'POST', headers: { Origin: 'https://chakar.test', 'Content-Type': 'application/json' }, body: JSON.stringify(custom),
  }));
  assert.ok(staleSave.status >= 400);
  assert.match((await staleSave.json()).error, /delet/i);
  assert.equal(writeCount(), beforeWrites, 'The public save endpoint also rejects a stale deleted record.');

  const target = afterBoth[0];
  let beforeCalls = calls.length;
  authenticated = false;
  assert.equal((await collectionRoute.GET()).status, 401, 'Removed guide snapshots also remain behind admin authentication.');
  assert.equal((await deletionRoute.DELETE(request({ confirmationName: target.name }), context(target.id))).status, 401);
  assert.equal(calls.length, beforeCalls, 'Unauthenticated deletion must not reach the database.');
  authenticated = true;
  assert.equal((await deletionRoute.DELETE(request({ confirmationName: target.name }, 'https://other.test'), context(target.id))).status, 403);
  assert.equal(calls.length, beforeCalls, 'Cross-origin deletion must not reach the database.');

  beforeWrites = writeCount();
  for (const invalid of [undefined, {}, { confirmationName: '' }, { confirmationName: 42 }]) {
    assert.equal((await deletionRoute.DELETE(request(invalid), context(target.id))).status, 400, 'A deliberate textual confirmation is required.');
  }
  const invalidJson = new Request('https://chakar.test/api/destinations/test', {
    method: 'DELETE', headers: { Origin: 'https://chakar.test', 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal((await deletionRoute.DELETE(invalidJson, context(target.id))).status, 400);
  assert.equal((await deletionRoute.DELETE(request({ confirmationName: target.name }), context(''))).status, 400);
  assert.equal((await deletionRoute.DELETE(request({ confirmationName: target.name }), context(PACKAGE_DEFAULTS_RECORD_ID))).status, 400);
  const mismatch = await deletionRoute.DELETE(request({ confirmationName: `${target.name} wrong` }), context(target.id));
  assert.equal(mismatch.status, 409, 'The typed name must match the current destination, including after a rename.');
  assert.equal((await deletionRoute.DELETE(request({ confirmationName: 'Missing Valley' }), context('missing-valley'))).status, 404);
  assert.equal(writeCount(), beforeWrites, 'Invalid, stale and unknown destination requests must not write.');
  assert.ok((await listDestinations()).some((item) => item.id === target.id));

  failDatabase = true;
  const unavailable = await deletionRoute.DELETE(request({ confirmationName: target.name }), context(target.id));
  assert.equal(unavailable.status, 503, 'Database failures must be reported rather than presenting a false successful deletion.');
  assert.match((await unavailable.json()).error, /database|503|unavailable/i);
  assert.equal(writeCount(), beforeWrites);
  failDatabase = false;

  const deleted = await deletionRoute.DELETE(request({ confirmationName: `  ${target.name}  ` }), context(target.id));
  assert.equal(deleted.status, 200, 'Matching confirmation permits surrounding whitespace.');
  assert.deepEqual(await deleted.json(), { ok: true });
  assert.equal(writeCount(), beforeWrites + 1);
  assert.ok(!(await listDestinations()).some((item) => item.id === target.id));
  beforeWrites = writeCount();
  assert.equal((await deletionRoute.DELETE(request({ confirmationName: target.name }), context(target.id))).status, 404, 'A stale delete request cannot operate on an already removed destination.');
  assert.equal(writeCount(), beforeWrites);
  assert.deepEqual(await loadPackageDefaults(), defaults);
  // Simulate deletion landing after the save's read, before its write.
  const concurrent = { ...initial[2], id: 'test-concurrent', name: 'Concurrent Valley' };
  await saveDestination(concurrent);
  deleteBeforeSave = true;
  await assert.rejects(saveDestination(concurrent), /delet/i, 'A simultaneous delete must win over an existing-row edit.');
  assert.equal(rows.get(concurrent.id).record.kind, 'deleted-destination');
  const concurrentSeed = { ...initial[3], id: 'test-concurrent-seed', name: 'Concurrent Seed Valley' };
  deleteBeforeSave = true;
  await assert.rejects(saveDestination(concurrentSeed), /delet/i, 'An initial seed edit must not overwrite a simultaneously inserted tombstone.');
  assert.equal(rows.get(concurrentSeed.id).record.kind, 'deleted-destination');
  console.log('Destination deletion persistence, stale-save prevention, shared-default isolation and guarded API checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
