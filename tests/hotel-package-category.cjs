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
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
const { hotelPackageCategory, hotelPropertyCategory, matchesPackageCategory, suggestedHotel } = require('../lib/hotels.ts');
const { validateHotel } = require('../lib/hotel-validation.ts');
const { parseHotelPdfText, mergeHotelImportRecord, hotelImportIdentity } = require('../lib/hotel-pdf-import.ts');
const { hotelAlternativeCandidates } = require('../lib/hotel-options.ts');
function hotel(overrides = {}) {
  return { id: 'manual-hotel', destination: 'Sonamarg', name: 'Mountain Retreat', sourceCategory: '3 Star', starRating: 3,
    normalizedCategory: 'Elite', mapB2B: 3000, extraBedB2B: 800, cnbB2B: 400, address: '', roomType: 'Deluxe', website: '',
    sourceType: 'Admin entry', rateValidity: '2026-10-01 to 2026-11-30', availabilityStatus: 'Available', lastUpdated: '2026-10-13', sourceFiles: [], notes: '', ...overrides };
}
let checks = 0;
const failures = [];
function test(name, run) { try { run(); checks++; process.stdout.write(`PASS ${name}\n`); } catch (error) { failures.push(error); process.stderr.write(`FAIL ${name}: ${error.stack}\n`); } }
test('manual package category overrides supplier class and star rating', () => {
  const record = hotel();
  assert.equal(hotelPackageCategory(record), 'Elite');
  assert.equal(matchesPackageCategory(record, 'Elite'), true);
  assert.equal(matchesPackageCategory(record, 'Signature'), false);
});
test('all four manual bands match only themselves', () => {
  const bands = ['Signature', 'Signature Plus', 'Signature Premium', 'Elite'];
  for (const band of bands) for (const requested of bands) {
    assert.equal(matchesPackageCategory(hotel({ normalizedCategory: band, starRating: 5, sourceCategory: 'Luxury' }), requested), band === requested);
  }
});
test('legacy supplier classifications continue to infer their original package band', () => {
  for (const [classification, band] of [['Budget', 'Signature'], ['3 Star', 'Signature'], ['3 Star Premium', 'Signature Plus'], ['3 Star Deluxe', 'Signature Plus'], ['4 Star', 'Signature Premium'], ['4 Star Deluxe', 'Signature Premium'], ['4 Star Premium', 'Signature Premium'], ['5 Star Basic', 'Elite'], ['5 Star Premium', 'Elite'], ['5 Star', 'Elite'], ['Luxury', 'Elite']]) {
    assert.equal(hotelPackageCategory({ normalizedCategory: classification }), band);
  }
  assert.equal(hotelPackageCategory({ normalizedCategory: 'Unspecified' }), null);
  assert.equal(matchesPackageCategory({ normalizedCategory: '3 Star' }, 'Signature'), true);
});
test('supplier property class stays separate from the manual band', () => {
  assert.equal(hotelPropertyCategory(hotel()), '3 Star');
  assert.equal(hotelPropertyCategory(hotel({ sourceCategory: '4-star deluxe' })), '4 Star Deluxe');
  assert.equal(hotelPropertyCategory(hotel({ sourceCategory: '' })), null);
  assert.equal(hotelPropertyCategory(hotel({ sourceCategory: 'Elite' })), null);
  assert.equal(hotelPropertyCategory(hotel({ normalizedCategory: '3 Star Deluxe', sourceCategory: 'Anything' })), '3 Star Deluxe');
});
test('source and star profile updates preserve an omitted manual category', () => {
  const updated = validateHotel({ sourceCategory: '5 Star', starRating: 5, mapB2B: 3500 }, hotel());
  assert.equal(updated.normalizedCategory, 'Elite');
  assert.equal(hotelPackageCategory(updated), 'Elite');
  assert.equal(updated.mapB2B, 3500);
});
test('profile edits can deliberately change a manual package category', () => {
  assert.equal(validateHotel({ normalizedCategory: 'Signature Plus' }, hotel()).normalizedCategory, 'Signature Plus');
  assert.equal(validateHotel({ destination: 'Srinagar', name: 'New Hotel', normalizedCategory: 'Elite' }).normalizedCategory, 'Elite');
});
test('invalid manual category values are rejected while legacy values remain readable', () => {
  for (const value of ['Signature Super', 'Elite Gold', 4, null]) assert.throws(() => validateHotel({ normalizedCategory: value }, hotel()), /category/i);
  assert.equal(validateHotel({ normalizedCategory: '3 Star' }, hotel()).normalizedCategory, '3 Star');
});
test('manual hotel matching outranks incompatible supplier star classifications', () => {
  const manual = hotel();
  const cheaperLegacy = hotel({ id: 'legacy', name: 'Legacy Hotel', normalizedCategory: '3 Star', mapB2B: 1000 });
  assert.equal(suggestedHotel('Sonamarg', 'Elite', [cheaperLegacy, manual], '2026-10-15', '2026-10-17').id, manual.id);
});
test('an explicit other-band property is never automatically suggested', () => {
  assert.equal(suggestedHotel('Sonamarg', 'Signature', [hotel()], '2026-10-15', '2026-10-17'), null);
  assert.equal(suggestedHotel('Sonamarg', 'Signature', [hotel({ normalizedCategory: 'Signature Plus' })]), null);
});
test('legacy unclassified fallback still recovers a destination without manual inventory', () => {
  const legacy = hotel({ normalizedCategory: 'Unspecified', mapB2B: null });
  assert.equal(suggestedHotel('Sonamarg', 'Signature', [legacy]).id, legacy.id);
});
test('PDF updates preserve manual category and refresh supplier classification and rates', () => {
  const result = parseHotelPdfText('CHAKAR HOTEL RECORD\nDestination: Sonmarg\nName: Mountain Retreat\nCategory: 5 Star\nStars: 5\nMAP B2B: 4200\nEND HOTEL', [hotel()], 'hotel-rates.pdf')[0];
  assert.equal(result.action, 'update');
  assert.equal(result.hotel.id, 'manual-hotel');
  assert.equal(result.hotel.normalizedCategory, 'Elite');
  assert.equal(result.hotel.sourceCategory, '5 Star');
  assert.equal(result.hotel.starRating, 5);
  assert.equal(result.hotel.mapB2B, 4200);
});
test('PDF package category columns cannot override a saved manual category', () => {
  const result = parseHotelPdfText('CHAKAR HOTEL RECORD\nID: manual-hotel\nPackage Category: Signature\nSupplier Category: Budget\nMAP B2B: 2700\nEND HOTEL', [hotel()], 'supplier.pdf')[0];
  assert.equal(result.hotel.normalizedCategory, 'Elite');
  assert.equal(result.hotel.sourceCategory, 'Budget');
});
test('new PDF records keep an initial category until an operator changes it', () => {
  const result = parseHotelPdfText('CHAKAR HOTEL RECORD\nDestination: Srinagar\nName: New Lake Hotel\nCategory: 3 Star Deluxe\nMAP B2B: 3200\nEND HOTEL', [], 'new.pdf')[0];
  assert.equal(result.action, 'create');
  assert.equal(hotelPackageCategory(result.hotel), 'Signature Plus');
});
test('legacy records may still refresh supplier categories on import', () => {
  const result = mergeHotelImportRecord({ normalizedCategory: '4 Star', starRating: 4 }, hotel({ normalizedCategory: '3 Star' }), 'rates.xlsx', 'Excel import');
  assert.equal(result.normalizedCategory, '4 Star');
  assert.equal(hotelPackageCategory(result), 'Signature Premium');
});
test('apply-time merges retain the current manual category instead of a stale preview', () => {
  const preview = hotel({ normalizedCategory: 'Signature', mapB2B: 3600 });
  const current = hotel({ normalizedCategory: 'Signature Plus' });
  const merged = mergeHotelImportRecord(preview, current, 'rates.xlsx', 'Excel import');
  assert.equal(merged.normalizedCategory, 'Signature Plus');
  assert.equal(merged.mapB2B, 3600);
});
test('import identity normalizes spacing and Kashmir destination aliases', () => {
  assert.equal(hotelImportIdentity(' Sonamarg ', ' Mountain   Retreat '), hotelImportIdentity('sonmarg', 'mountain retreat'));
  assert.equal(hotelImportIdentity('Doodpathri', 'Meadow Inn'), hotelImportIdentity('Doodhpathri', 'Meadow Inn'));
});
test('a name-matched import keeps the stored identity even when a supplier ID differs', () => {
  const result = parseHotelPdfText('CHAKAR HOTEL RECORD\nID: supplier-reference\nDestination: Sonmarg\nName: Mountain Retreat\nMAP B2B: 3500\nEND HOTEL', [hotel()], 'supplier.pdf')[0];
  assert.equal(result.action, 'update');
  assert.equal(result.hotel.id, 'manual-hotel');
});
test('manual-band primary alternatives can include matching legacy supplier records', () => {
  const primaryRecord = hotel({ normalizedCategory: 'Signature', sourceCategory: '3 Star' });
  const primary = { location: 'Sonamarg', hotelId: primaryRecord.id, hotelName: primaryRecord.name, category: 'Signature', nightlyRate: 3000, source: 'Admin entry', roomType: 'Deluxe' };
  const good = hotel({ id: 'legacy-good', name: 'Legacy Match', normalizedCategory: '3 Star', mapB2B: 3100 });
  const wrongBand = hotel({ id: 'manual-wrong', name: 'Wrong Band', normalizedCategory: 'Elite', mapB2B: 3100 });
  const goodManual = hotel({ id: 'manual-good', name: 'Manual Match', normalizedCategory: 'Signature', mapB2B: 3200 });
  assert.deepEqual(hotelAlternativeCandidates(primary, [primaryRecord, good, wrongBand, goodManual], 'Signature', '2026-10-15', '2026-10-17').map((item) => item.id), ['legacy-good', 'manual-good']);
});
test('explicit manual-band primary with no supplier class can offer same-band properties', () => {
  const primaryRecord = hotel({ sourceCategory: '' });
  const primary = { location: 'Sonamarg', hotelId: primaryRecord.id, hotelName: primaryRecord.name, category: 'Elite', nightlyRate: 3000, source: 'Admin entry', roomType: 'Deluxe' };
  const good = hotel({ id: 'manual-compatible', name: 'Manual Compatible', sourceCategory: '4 Star', mapB2B: 3100 });
  assert.deepEqual(hotelAlternativeCandidates(primary, [primaryRecord, good], 'Elite', '2026-10-15', '2026-10-17').map((item) => item.id), ['manual-compatible']);
});
test('manual band authority is not overridden by supplier stars for alternatives', () => {
  const primaryRecord = hotel({ normalizedCategory: 'Signature', sourceCategory: '5 Star' });
  const primary = { location: 'Sonamarg', hotelId: primaryRecord.id, hotelName: primaryRecord.name, category: 'Signature', nightlyRate: 3000, source: 'Admin entry', roomType: 'Deluxe' };
  const good = hotel({ id: 'same-band', name: 'Same Package', normalizedCategory: 'Signature', sourceCategory: '3 Star', mapB2B: 3100 });
  assert.deepEqual(hotelAlternativeCandidates(primary, [primaryRecord, good], 'Signature', '2026-10-15', '2026-10-17').map((item) => item.id), ['same-band']);
});
if (failures.length) { process.stderr.write(`${failures.length} package-category checks failed.\n`); process.exitCode = 1; }
else process.stdout.write(`${checks} manual package-category checks passed.\n`);
