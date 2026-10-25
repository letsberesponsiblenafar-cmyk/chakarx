const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, main, options) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, main, options);
};
let authenticated = true;
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'server-only') return {};
  if (request === '@/lib/admin-auth') return { isAdmin: async () => authenticated,
    sameOrigin: request => request.headers.get('origin') === new URL(request.url).origin };
  return originalLoad.call(this, request, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true },
}).outputText, filename);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const { defaultPdfDesign, initialPdfDesignLibrary, PDF_DESIGN_RECORD_PREFIX } = require('../lib/pdf-designs.ts');
const store = require('../lib/pdf-design-store.ts');
const { destinations } = require('../lib/data.ts');
const destinationStore = require('../lib/destination-store.ts');
const designsRoute = require('../app/api/pdf-designs/route.ts');
const assetsRoute = require('../app/api/pdf-design-assets/route.ts');
const imageRoute = require('../app/api/pdf-design-assets/[id]/route.ts');
const rows = new Map(), calls = [];
const designId = theme => `${PDF_DESIGN_RECORD_PREFIX}design_${theme}__`;
global.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  assert.match(url, /\/rest\/v1\/destination_master/);
  assert.equal(options.cache, 'no-store');
  assert.equal(options.headers.apikey, 'sb_secret_test');
  assert.ok(!options.headers.Authorization, 'Supabase secret keys are not bearer JWTs.');
  const query = new URL(url).searchParams;
  if (options.method === 'POST') {
    const row = JSON.parse(options.body);
    if (rows.has(row.id) && options.headers.Prefer.includes('ignore-duplicates')) return Response.json([]);
    rows.set(row.id, structuredClone(row));
    return options.headers.Prefer.includes('return=representation') ? Response.json([row]) : new Response(null, { status: 201 });
  }
  if (options.method === 'PATCH') {
    const row = JSON.parse(options.body), existing = rows.get(row.id);
    const expected = query.get('record->>revision');
    if (!existing || existing.record.kind !== 'pdf-design' || expected !== `eq.${existing.record.revision}`) return Response.json([]);
    rows.set(row.id, structuredClone(row));
    return Response.json([row]);
  }
  const filter = query.get('id');
  if (filter?.startsWith('eq.')) return Response.json(rows.has(filter.slice(3)) ? [rows.get(filter.slice(3))] : []);
  if (filter?.startsWith('in.(')) {
    const ids = filter.slice(4, -1).split(',');
    return Response.json([...rows.values()].filter(row => ids.includes(row.id) && (!query.has('record->>kind') || query.get('record->>kind') === `eq.${row.record.kind}`)));
  }
  // Return reserved rows deliberately: the catalog must defend in application
  // code too, even if a proxy or future query overlooks its SQL filter.
  return Response.json([...rows.values()]);
};
const request = (endpoint, body, method = 'PUT', origin = 'https://chakar.test') => new Request(`https://chakar.test${endpoint}`, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const assetRequest = (body, origin) => request('/api/pdf-design-assets', body, 'POST', origin);
const getImage = id => imageRoute.GET(new Request(`https://chakar.test/api/pdf-design-assets/${id}`), { params: Promise.resolve({ id }) });
const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(root, 'public', file)).toString('base64')}`;
const png = dataUrl('chakar-logo-original-white.png', 'image/png');
const jpeg = dataUrl('pdf-assets/winter/winter-cover.jpg', 'image/jpeg');

(async () => {
  assert.deepEqual(await store.loadPdfDesignLibrary(), initialPdfDesignLibrary(), 'Existing databases need no settings migration.');
  const asset = await store.savePdfDesignAsset(png, 'White logo.png');
  assert.match(asset.url, /^\/api\/pdf-design-assets\/[a-f0-9]{64}$/);
  assert.ok(asset.width > 0 && asset.height > 0);
  const sha = asset.url.split('/').at(-1);
  const assetRow = `${PDF_DESIGN_RECORD_PREFIX}asset_${sha}`;
  const originalAsset = structuredClone(rows.get(assetRow));
  const repeated = await store.savePdfDesignAsset(png, 'Different display name.png');
  assert.equal(repeated.url, asset.url);
  assert.deepEqual(rows.get(assetRow), originalAsset, 'Re-uploading identical bytes never rewrites the immutable asset.');
  const loaded = await store.loadPdfDesignAsset(sha);
  assert.equal(loaded.bytes.toString('base64'), png.split(',')[1]);
  const photograph = await store.savePdfDesignAsset(jpeg, 'Winter.jpg');
  assert.equal(photograph.width, 1024);
  assert.equal(photograph.height, 1536);
  const winter = { ...defaultPdfDesign('winter'), images: { coverMain: photograph.url, logoLight: asset.url } };
  const before = JSON.stringify(winter);
  const saved = await store.savePdfDesign('winter', winter, 0);
  assert.equal(saved.revision, 1);
  assert.equal(JSON.stringify(winter), before, 'Saving never mutates the calling draft.');
  assert.deepEqual((await store.loadPdfDesignLibrary()).winter, saved);
  const itinerarySnapshot = structuredClone(saved.settings);
  const edited = { ...winter, colors: { ...winter.colors, accent: '#B9D6E3' } };
  const outcomes = await Promise.allSettled([store.savePdfDesign('winter', edited, 1), store.savePdfDesign('winter', winter, 1)]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1, 'Concurrent edits use atomic revision comparison, not read-then-upsert.');
  assert.equal(outcomes.filter(item => item.status === 'rejected' && item.reason instanceof store.PdfDesignConflictError).length, 1);
  assert.deepEqual(itinerarySnapshot, saved.settings, 'Editing shared defaults cannot change a captured itinerary design.');
  await assert.rejects(store.savePdfDesign('winter', winter, 0), store.PdfDesignConflictError);
  await assert.rejects(store.savePdfDesign('winter', winter, 1), store.PdfDesignConflictError);
  await assert.rejects(store.savePdfDesign('original', winter, 0), /does not match/);
  await assert.rejects(store.savePdfDesign('winter', winter, 1.5), /revision/);
  await assert.rejects(store.savePdfDesign('winter', { ...winter, images: { coverMain: '/api/pdf-design-assets/' + '0'.repeat(64) } }, 2), /no longer available/);
  let count = calls.length;
  await assert.rejects(store.savePdfDesign('winter', { ...winter, images: { coverMain: 'https://elsewhere.test/private' } }, 2), /uploaded image/);
  assert.equal(calls.length, count, 'External image URLs are rejected without any fetch.');

  const catalog = await destinationStore.loadDestinationCatalog();
  assert.equal(catalog.destinations.length, destinations.length);
  assert.equal(catalog.archivedDestinations.length, 0);
  assert.ok(!catalog.destinations.some(item => item.id?.startsWith(PDF_DESIGN_RECORD_PREFIX)));
  assert.ok(calls.some(call => new URL(call.url).searchParams.getAll('id').some(filter => filter.startsWith('not.like.'))), 'The database query excludes all design/asset records before its limit.');
  await assert.rejects(destinationStore.saveDestination({ ...destinations[0], id: designId('winter') }), /reserved/);
  await assert.rejects(destinationStore.deleteDestination({ ...destinations[0], id: assetRow }), /reserved/);

  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', png.replace('image/png', 'image/jpeg'), png.slice(0, -12), jpeg.replace('image/jpeg', 'image/png'), 'data:image/png;base64,AAAA', png.replace('base64,', 'base64,\n')]) {
    assert.throws(() => store.inspectPdfDesignImage(bad), store.PdfDesignInputError);
  }
  const damaged = Buffer.from(png.split(',')[1], 'base64'); damaged[damaged.length - 1] ^= 1;
  assert.throws(() => store.inspectPdfDesignImage(`data:image/png;base64,${damaged.toString('base64')}`), /damaged/);
  const enormousJpeg = Buffer.from(jpeg.split(',')[1], 'base64');
  let marker = 2;
  while (marker + 10 < enormousJpeg.length) {
    if ([0xc0, 0xc1, 0xc2].includes(enormousJpeg[marker + 1])) { enormousJpeg.writeUInt16BE(5000, marker + 7); break; }
    marker += 2 + enormousJpeg.readUInt16BE(marker + 2);
  }
  assert.throws(() => store.inspectPdfDesignImage(`data:image/jpeg;base64,${enormousJpeg.toString('base64')}`), /4096 pixels/);
  assert.throws(() => store.inspectPdfDesignImage(undefined), error => error.status === 400);
  assert.throws(() => store.inspectPdfDesignImage('data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024)), error => error.status === 413);
  count = calls.length;
  assert.equal(await store.loadPdfDesignAsset('../../private'), null);
  assert.equal(calls.length, count, 'Invalid asset IDs never reach storage.');

  authenticated = false;
  count = calls.length;
  assert.equal((await designsRoute.GET()).status, 401);
  assert.equal((await designsRoute.PUT(request('/api/pdf-designs', { theme: 'winter', settings: winter, revision: 2 }))).status, 401);
  assert.equal((await assetsRoute.POST(assetRequest({ dataUrl: png }))).status, 401);
  assert.equal((await getImage(sha)).status, 401);
  assert.equal(calls.length, count, 'Every design/image endpoint requires sign-in before database access.');
  authenticated = true;
  assert.equal((await designsRoute.PUT(request('/api/pdf-designs', {}, 'PUT', 'https://other.test'))).status, 403);
  assert.equal((await assetsRoute.POST(assetRequest({ dataUrl: png }, 'https://other.test'))).status, 403);
  assert.equal(calls.length, count, 'Cross-origin writes never reach storage.');
  assert.equal((await designsRoute.PUT(request('/api/pdf-designs', { theme: 'winter', settings: winter, revision: 0 }))).status, 409);
  assert.equal((await designsRoute.PUT(request('/api/pdf-designs', { theme: 'winter', settings: winter, revision: 2 }))).status, 200);
  const refreshed = await designsRoute.GET();
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.headers.get('cache-control'), 'no-store');
  assert.equal((await refreshed.json()).designs.winter.revision, 3);
  const imageResponse = await getImage(sha);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('content-type'), 'image/png');
  assert.equal(imageResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.match(imageResponse.headers.get('cache-control'), /^private,/);
  assert.equal(imageResponse.headers.get('vary'), 'Cookie');
  assert.equal(Buffer.from(await imageResponse.arrayBuffer()).toString('base64'), png.split(',')[1]);
  assert.equal((await getImage('bad')).status, 404);
  assert.equal((await getImage('0'.repeat(64))).status, 404);
  const uploaded = await assetsRoute.POST(assetRequest({ dataUrl: png, name: 'Shared logo' }));
  assert.equal(uploaded.status, 201);
  assert.equal((await uploaded.json()).url, asset.url);
  assert.equal((await assetsRoute.POST(assetRequest({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }))).status, 400);
  const malformed = new Request('https://chakar.test/api/pdf-designs', { method: 'PUT', headers: { Origin: 'https://chakar.test' }, body: '{broken' });
  assert.equal((await designsRoute.PUT(malformed)).status, 400);
  const oversized = new Request('https://chakar.test/api/pdf-design-assets', { method: 'POST', headers: { Origin: 'https://chakar.test', 'Content-Length': String(4 * 1024 * 1024) }, body: '{}' });
  assert.equal((await assetsRoute.POST(oversized)).status, 413);
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(20000)); }, cancel() { cancelled = true; } });
  const streamingRequest = new Request('https://chakar.test/api/pdf-designs', { method: 'PUT', headers: { Origin: 'https://chakar.test' }, body: stream, duplex: 'half' });
  assert.equal((await designsRoute.PUT(streamingRequest)).status, 413);
  assert.ok(cancelled, 'Oversized streamed input is cancelled before parsing.');

  rows.get(assetRow).record.dataUrl = jpeg;
  assert.equal((await getImage(sha)).status, 503, 'Corrupted immutable assets fail rather than returning different bytes for a saved reference.');
  rows.set(assetRow, originalAsset);
  let attempts = 0;
  global.fetch = async () => { attempts++; return new Response('secret connection details and SQL', { status: 503 }); };
  const unavailable = await designsRoute.GET();
  assert.equal(unavailable.status, 503);
  assert.equal(attempts, 2, 'Read-only fetches receive one bounded retry.');
  assert.doesNotMatch(await unavailable.text(), /secret|SQL|supabase|sb_secret/);
  assert.equal((await assetsRoute.POST(assetRequest({ dataUrl: png }))).status, 503);
  assert.equal((await designsRoute.PUT(request('/api/pdf-designs', { theme: 'original', settings: defaultPdfDesign('original'), revision: 0 }))).status, 503);
  console.log('PASS PDF design storage: default loading, atomic revisions, immutable JPEG/PNG assets, image validation, destination isolation, snapshot preservation, authentication/origin guards, bounded input and safe errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
