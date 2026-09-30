const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = function (module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  module._compile(output, filename);
};

const { listHotels } = require(path.resolve(__dirname, '../lib/hotel-store.ts'));
const { listSavedItineraries } = require(path.resolve(__dirname, '../lib/itinerary-store.ts'));

(async () => {
  for (const [list, table] of [[listHotels, 'hotel_master'], [listSavedItineraries, 'saved_itineraries']]) {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? new Response('temporarily unavailable', { status: 503 }) : Response.json([]);
    };
    assert.deepEqual(await list(), []);
    assert.equal(calls.length, 2, `${table} did not retry a temporary failure`);
    assert.ok(calls.every((call) => call.url.includes(`/rest/v1/${table}`)));
    assert.ok(calls.every((call) => call.options.cache === 'no-store'));
    assert.ok(calls.every((call) => !('Authorization' in call.options.headers)), 'Secret API keys must not be sent as JWT bearer tokens');
  }
  console.log('Hotel and saved-itinerary stores recover from transient database failures.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
