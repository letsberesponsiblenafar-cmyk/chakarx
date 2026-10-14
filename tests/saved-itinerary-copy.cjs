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
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, filename);
};
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const store = require('../lib/itinerary-store.ts');
const route = require('../app/api/itineraries/[id]/copy/route.ts');
const sourceId = 'c4851c67-2bc9-4f9e-b48d-6569364baf03';
const missingId = 'cf58570e-8357-4e55-980e-4058027193b9';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const original = {
  id: sourceId, client_name: 'Test client', arrival: '2026-12-14', departure: '2026-12-16',
  days: 3, nights: 2, package_total: 55220,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-03T11:00:00.000Z',
  last_downloaded_at: '2026-10-03T12:00:00.000Z', download_count: 4,
  snapshot: {
    input: { name: 'Test client', arrival: '2026-12-14', departure: '2026-12-16', transport: 'Custom vehicle', adults: 6 },
    plan: { days: 3, nights: 2, dayPlans: [{ day: 1, destination: 'Srinagar', description: 'Original description', selections: ['Dal Lake'] }] },
    routeVersion: 'current', generated: true,
    hotelSelections: [{ hotelId: 'hotel-001', hotelName: 'Example hotel', nightlyRate: 4000, nights: 2, rateConfirmed: true, alternatives: [{ hotelName: 'Example alternative', customId: 'alternative-1', nightlyRate: 4200 }] }],
    hotelDefaults: { rooms: 3, nightlyRate: 4000 },
    costModel: { transportDaily: 3400, transportIsCustom: true, activityCosts: { gondola: 6000 }, activitySelections: { gondola: true }, manualInclusions: ['Welcome hamper'], manualExclusions: ['Flights'] },
  },
};
const records = new Map([[sourceId, structuredClone(original)]]);
const calls = [];
let failInsert = false;
let omitConfirmation = false;
global.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  assert.match(url, /\/rest\/v1\/saved_itineraries/);
  assert.equal(options.cache, 'no-store');
  assert.ok(!options.headers.Authorization, 'A Supabase secret key is not sent as a JWT bearer token.');
  const id = new URL(url).searchParams.get('id')?.replace(/^eq\./, '');
  if (options.method === 'POST') {
    assert.equal(id, undefined, 'Creating a copy must not target the original row.');
    if (failInsert) return new Response('temporarily unavailable', { status: 503 });
    const record = JSON.parse(options.body);
    assert.match(record.id, uuid);
    assert.ok(!records.has(record.id), 'A copied row requires a fresh ID.');
    assert.equal(options.headers.Prefer, 'return=representation');
    if (omitConfirmation) return Response.json([]);
    records.set(record.id, record);
    return Response.json([record]);
  }
  if (options.method === 'PATCH') {
    assert.ok(records.has(id));
    const changed = { ...records.get(id), ...JSON.parse(options.body) };
    records.set(id, changed);
    return Response.json([changed]);
  }
  return Response.json(records.has(id) ? [records.get(id)] : []);
};
const request = (origin = 'https://chakar.test') => new Request(`https://chakar.test/api/itineraries/${sourceId}/copy`, {
  method: 'POST', headers: { Origin: origin },
});
const context = (id = sourceId) => ({ params: Promise.resolve({ id }) });

(async () => {
  authenticated = false;
  assert.equal((await route.POST(request(), context())).status, 401);
  assert.equal(calls.length, 0, 'Unauthenticated copying does not reach the database.');
  authenticated = true;
  assert.equal((await route.POST(request('https://other.test'), context())).status, 403);
  assert.equal((await route.POST(request(), context('not-a-uuid'))).status, 400);
  assert.equal(calls.length, 0, 'Cross-origin and invalid UUID requests never reach the database.');
  assert.equal((await route.POST(request(), context(missingId))).status, 404);
  assert.equal(records.size, 1, 'Missing originals cannot create an empty itinerary.');

  const response = await route.POST(request(), context());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { itinerary } = await response.json();
  assert.notEqual(itinerary.id, sourceId);
  assert.equal(itinerary.client_name, original.client_name, 'Copying must not alter the name shown to the client.');
  assert.equal(itinerary.snapshot, undefined, 'The menu only needs the new card summary.');
  const copied = await store.getSavedItinerary(itinerary.id);
  assert.deepEqual(copied.snapshot, original.snapshot, 'Every hotel, rate, activity, description, manual inclusion and route field is preserved.');
  for (const field of ['client_name', 'arrival', 'departure', 'days', 'nights', 'package_total']) assert.deepEqual(copied[field], original[field]);
  assert.equal(copied.created_at, copied.updated_at);
  assert.ok(new Date(copied.created_at) > new Date(original.updated_at));
  assert.equal(copied.last_downloaded_at, null);
  assert.equal(copied.download_count, 0);
  assert.deepEqual(records.get(sourceId), original, 'The original row and its download history remain untouched.');
  copied.snapshot.plan.dayPlans[0].description = 'A different description in the copy';
  copied.snapshot.hotelSelections[0].nightlyRate = 4900;
  copied.snapshot.costModel.activityCosts.gondola = 6600;
  assert.deepEqual(records.get(sourceId), original, 'Changing the loaded copy cannot mutate the original snapshot.');
  const revised = await store.saveItinerary(copied.snapshot, 61000, copied.id, true);
  assert.equal(revised.id, copied.id);
  assert.equal(revised.snapshot.plan.dayPlans[0].description, 'A different description in the copy');
  assert.equal(revised.package_total, 61000);
  assert.equal(revised.download_count, 1);
  assert.ok(revised.last_downloaded_at);
  assert.deepEqual(records.get(sourceId), original, 'Editing and redownloading the copy only updates the copy ID.');
  assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 1);
  assert.ok(calls.find((call) => call.options.method === 'PATCH').url.includes(copied.id));
  const second = await store.copySavedItinerary(sourceId);
  assert.notEqual(second.id, copied.id, 'A deliberate second copy is independent of both saved rows.');
  assert.deepEqual(second.snapshot, original.snapshot, 'Copies always use the chosen original, not a previously edited copy.');
  assert.equal(await store.copySavedItinerary(missingId), null);

  failInsert = true;
  let before = calls.length;
  assert.equal((await route.POST(request(), context())).status, 503);
  assert.equal(calls.slice(before).filter((call) => call.options.method === 'POST').length, 1, 'Writes are never automatically retried into extra copies.');
  assert.deepEqual(records.get(sourceId), original);
  failInsert = false;
  omitConfirmation = true;
  await assert.rejects(store.copySavedItinerary(sourceId), /did not confirm the copy/);
  assert.deepEqual(records.get(sourceId), original);
  console.log('Saved itinerary copies: full snapshot preservation, fresh IDs/dates, independent edits/downloads, reset history, auth/origin/UUID guards and failure handling passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
